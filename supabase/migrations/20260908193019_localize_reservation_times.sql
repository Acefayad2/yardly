alter table public.reservations drop constraint if exists reservations_same_utc_day;

create or replace function public.validate_listing_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Choose a valid timezone.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_validate_timezone on public.listings;
create trigger listings_validate_timezone before insert or update of timezone on public.listings
for each row execute function public.validate_listing_timezone();

drop policy if exists "reservations_guests_insert" on public.reservations;
create policy "reservations_guests_insert"
on public.reservations for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = guest_id
  and status = 'confirmed'
  and exists (
    select 1 from public.listings
    where listings.id = listing_id
      and listings.status = 'published'
      and listings.host_id <> (select auth.uid())
      and guests between 1 and listings.capacity
      and start_at > now()
      and (start_at at time zone listings.timezone)::date = (end_at at time zone listings.timezone)::date
      and (start_at at time zone listings.timezone)::time >= time '08:00'
      and (end_at at time zone listings.timezone)::time <= time '22:00'
      and extract(epoch from (end_at - start_at)) / 3600 = trunc(extract(epoch from (end_at - start_at)) / 3600)
      and extract(epoch from (end_at - start_at)) / 3600 between listings.min_hours and 14
      and subtotal = round(listings.hourly_price * (extract(epoch from (end_at - start_at)) / 3600), 2)
      and guest_fee = round(subtotal * 0.12, 2)
      and total = subtotal + guest_fee
      and host_payout = subtotal
  )
);

drop function if exists public.create_reservation(uuid, timestamptz, timestamptz, integer);

create function public.create_reservation(
  p_listing_id uuid,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_guests integer
)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_listing public.listings%rowtype;
  reservation_start timestamptz;
  reservation_end timestamptz;
  duration_hours numeric;
  calculated_subtotal numeric(10, 2);
  calculated_fee numeric(10, 2);
  created_reservation public.reservations%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before reserving a space.' using errcode = '42501';
  end if;

  select * into selected_listing
  from public.listings
  where id = p_listing_id and status = 'published';

  if not found then
    raise exception 'This space is not available for booking.' using errcode = 'P0002';
  end if;

  if selected_listing.host_id = caller_id then
    raise exception 'Hosts cannot reserve their own space.' using errcode = '22023';
  end if;

  if p_guests < 1 or p_guests > selected_listing.capacity then
    raise exception 'Guest count exceeds this space capacity.' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'Reservations must start and end on the same date.' using errcode = '22023';
  end if;

  if p_start_time < time '08:00' or p_end_time > time '22:00' then
    raise exception 'Reservations must be between 8:00 AM and 10:00 PM.' using errcode = '22023';
  end if;

  reservation_start := (p_booking_date + p_start_time) at time zone selected_listing.timezone;
  reservation_end := (p_booking_date + p_end_time) at time zone selected_listing.timezone;

  if reservation_start <= now() then
    raise exception 'Choose a future booking time.' using errcode = '22023';
  end if;

  duration_hours := extract(epoch from (reservation_end - reservation_start)) / 3600;
  if duration_hours <> trunc(duration_hours)
    or duration_hours < selected_listing.min_hours
    or duration_hours > 14 then
    raise exception 'Choose a whole-hour duration within this space booking limits.' using errcode = '22023';
  end if;

  calculated_subtotal := round(selected_listing.hourly_price * duration_hours, 2);
  calculated_fee := round(calculated_subtotal * 0.12, 2);

  insert into public.reservations (
    listing_id,
    guest_id,
    start_at,
    end_at,
    guests,
    subtotal,
    guest_fee,
    total,
    host_payout,
    status
  ) values (
    selected_listing.id,
    caller_id,
    reservation_start,
    reservation_end,
    p_guests,
    calculated_subtotal,
    calculated_fee,
    calculated_subtotal + calculated_fee,
    calculated_subtotal,
    'confirmed'
  ) returning * into created_reservation;

  return created_reservation;
exception
  when exclusion_violation then
    raise exception 'That time is no longer available. Choose another time.' using errcode = '23P01';
end;
$$;

revoke all on function public.create_reservation(uuid, date, time, time, integer) from public, anon;
grant execute on function public.create_reservation(uuid, date, time, time, integer) to authenticated;
