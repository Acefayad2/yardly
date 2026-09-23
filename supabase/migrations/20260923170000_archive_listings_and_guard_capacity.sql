-- Two related listing-lifecycle correctness fixes.

-- 1. Archived status: a reversible way for a host to stop managing a listing without
-- deleting it. Archived listings are automatically invisible to guests -- both
-- listings_anon_read_published and listings_authenticated_read already use an
-- exact-match `status = 'published'` predicate (20260827154148), so no RLS change is
-- required for the new value. archived -> draft re-enters the normal publish flow, the
-- same path paused -> draft already uses.
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft', 'published', 'paused', 'archived'));

-- 2. Guard against a host silently shrinking capacity below a guest count that an
-- existing reservation already committed to. Extends the same trigger that already
-- validates weekly_hours/blocked_dates/min_hours/timezone/status changes, rather than
-- adding a second trigger on the same table for a very similar concern.
drop trigger if exists listings_validate_availability on public.listings;

create or replace function public.validate_listing_availability()
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
  -- Only the explicit draft-to-published transition is guarded here (the only path
  -- the app itself ever takes -- new listings always insert as 'draft'). A row's own
  -- private address cannot exist yet at INSERT time regardless (listing_addresses.listing_id
  -- is a foreign key to this row's id), so a direct insert-as-published is caught the
  -- next time anyone updates that row, same as every other listing validation above.
  if tg_op = 'UPDATE' and new.status = 'published' and not exists (
    select 1 from public.listing_addresses where listing_addresses.listing_id = new.id
  ) then
    raise exception 'Add a private street address before publishing this listing.' using errcode = '22023';
  end if;
  -- A capacity change (whichever direction) must not leave a live reservation
  -- claiming more guests than the listing now allows. Reservations reference this row
  -- by id, so on INSERT no reservation can exist yet and this is always a no-op then.
  if exists (
    select 1 from public.reservations
    where reservations.listing_id = new.id
      and reservations.status in ('pending', 'confirmed')
      and reservations.end_at > now()
      and reservations.guests > new.capacity
  ) then
    raise exception 'Reduce capacity only after every reservation booked for more guests has ended or been cancelled.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger listings_validate_availability
before insert or update of weekly_hours, blocked_dates, min_hours, timezone, status, capacity
on public.listings for each row execute function public.validate_listing_availability();
revoke all on function public.validate_listing_availability() from public, anon, authenticated;
