-- Sunday first; null closes a weekday. Preserve existing 08:00–22:00 hours.
alter table public.listings
  add column weekly_hours jsonb not null default '[[8,22],[8,22],[8,22],[8,22],[8,22],[8,22],[8,22]]',
  add column blocked_dates date[] not null default '{}';

create function public.validate_listing_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare day_hours jsonb;
begin
  -- Serialize schedule changes with reservation inserts, including direct REST writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 0));
  if jsonb_typeof(new.weekly_hours) <> 'array' or jsonb_array_length(new.weekly_hours) <> 7 then
    raise exception 'Provide opening hours for all seven weekdays.' using errcode = '22023';
  end if;
  for day_hours in select value from jsonb_array_elements(new.weekly_hours) loop
    if day_hours = 'null'::jsonb then continue; end if;
    if jsonb_typeof(day_hours) <> 'array' or jsonb_array_length(day_hours) <> 2
      or jsonb_typeof(day_hours->0) <> 'number' or jsonb_typeof(day_hours->1) <> 'number' then
      raise exception 'Each open day needs a start and end hour.' using errcode = '22023';
    end if;
    if (day_hours->>0)::numeric <> trunc((day_hours->>0)::numeric)
      or (day_hours->>1)::numeric <> trunc((day_hours->>1)::numeric)
      or (day_hours->>0)::numeric < 8 or (day_hours->>1)::numeric > 22
      or (day_hours->>1)::numeric - (day_hours->>0)::numeric < new.min_hours then
      raise exception 'Opening hours must be whole hours between 8 AM and 10 PM, with room for the minimum booking.' using errcode = '22023';
    end if;
  end loop;
  if cardinality(new.blocked_dates) > 730 or array_position(new.blocked_dates, null) is not null then
    raise exception 'Choose up to 730 valid blocked dates.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger listings_validate_availability before insert or update of weekly_hours, blocked_dates, min_hours, timezone, status
on public.listings for each row execute function public.validate_listing_availability();
revoke all on function public.validate_listing_availability() from public, anon, authenticated;

create function public.enforce_reservation_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare yard public.listings; local_start timestamp; local_end timestamp; day_hours jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.listing_id::text, 0));
  select * into yard from public.listings where id = new.listing_id and status = 'published';
  if not found then raise exception 'This space is unavailable.' using errcode = '22023'; end if;
  local_start := new.start_at at time zone yard.timezone;
  local_end := new.end_at at time zone yard.timezone;
  day_hours := yard.weekly_hours->extract(dow from local_start)::int;
  if local_start::date = any(yard.blocked_dates) or day_hours = 'null'::jsonb then
    raise exception 'The host is unavailable on this date. Choose another date.' using errcode = '22023';
  end if;
  if local_start::date <> local_end::date or local_end <= local_start
    or date_trunc('hour', local_start) <> local_start or date_trunc('hour', local_end) <> local_end
    or extract(hour from local_start) < (day_hours->>0)::int
    or extract(hour from local_end) > (day_hours->>1)::int then
    raise exception 'Choose a whole-hour booking within the host opening hours.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger reservations_enforce_availability before insert on public.reservations
for each row execute function public.enforce_reservation_availability();
revoke all on function public.enforce_reservation_availability() from public, anon, authenticated;

-- A privileged read is necessary to exclude OTHER guests' bookings without
-- granting access to their reservation rows. Only time pairs for published
-- listings are public; no identities, booking IDs, or payment data are returned.
create schema if not exists private;
create function private.booking_slots(p_listing_id uuid, p_booking_date date)
returns table(start_hour integer, end_hour integer)
language plpgsql stable security definer set search_path = '' as $$
declare yard public.listings; day_hours jsonb;
begin
  select * into yard from public.listings where id = p_listing_id and status = 'published';
  if not found or p_booking_date is null or not isfinite(p_booking_date) then return; end if;
  if p_booking_date < (now() at time zone yard.timezone)::date
    or p_booking_date = any(yard.blocked_dates) then return; end if;
  day_hours := yard.weekly_hours->extract(dow from p_booking_date)::int;
  if day_hours = 'null'::jsonb then return; end if;
  return query
    select s, e
    from generate_series((day_hours->>0)::int, (day_hours->>1)::int - yard.min_hours) s
    cross join lateral generate_series(s + yard.min_hours, (day_hours->>1)::int) e
    where ((p_booking_date + make_time(s, 0, 0)) at time zone yard.timezone) > now()
      and not exists (
        select 1 from public.reservations r where r.listing_id = yard.id
          and r.status in ('pending', 'confirmed')
          and r.start_at < ((p_booking_date + make_time(e, 0, 0)) at time zone yard.timezone)
          and r.end_at > ((p_booking_date + make_time(s, 0, 0)) at time zone yard.timezone)
      ) order by s, e;
end;
$$;
revoke all on function private.booking_slots(uuid, date) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.booking_slots(uuid, date) to anon, authenticated;

create function public.get_booking_slots(p_listing_id uuid, p_booking_date date)
returns table(start_hour integer, end_hour integer)
language sql stable security invoker set search_path = '' as $$
  select * from private.booking_slots(p_listing_id, p_booking_date);
$$;
revoke all on function public.get_booking_slots(uuid, date) from public, anon, authenticated;
grant execute on function public.get_booking_slots(uuid, date) to anon, authenticated;
