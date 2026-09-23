-- Reservation lifecycle: drop the dead 'pending' status, wire up 'completed'.
--
-- 'pending' has never been written by any code path -- create_reservation always inserts
-- the literal 'confirmed' -- so narrowing the CHECK constraint is a zero-risk cleanup,
-- not a behavior change. 'completed' has always been a legal value but was never
-- reachable; this migration adds the one mechanism that reaches it.
--
-- There is no server, cron, or scheduled job anywhere in this project, so completion is
-- a lazy sweep: a narrow function that flips any past confirmed reservation to completed,
-- called from the client whenever a guest or host loads their reservations. It mirrors
-- the existing private.booking_slots / public.get_booking_slots split -- the one
-- precedent in this codebase for a SECURITY DEFINER function.

-- 1. Narrow the status CHECK and fix the now-invalid default.
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('confirmed', 'completed', 'cancelled'));
alter table public.reservations alter column status set default 'confirmed';

-- 2. Simplify the overlap guard. Can't ALTER a constraint's predicate in place.
alter table public.reservations drop constraint if exists reservations_no_active_overlap;
alter table public.reservations add constraint reservations_no_active_overlap
  exclude using gist (
    listing_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'confirmed');

-- 3. cancel_reservation: narrow the eligibility filter. Deliberate side effect -- a
-- completed reservation can no longer be cancelled. Cancelling something that has
-- objectively already happened doesn't make sense; this is distinct from the separate,
-- still-deferred cancellation-cutoff-window policy for future bookings.
create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  cancelled_reservation public.reservations%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before cancelling a reservation.' using errcode = '42501';
  end if;

  update public.reservations as reservation
  set status = 'cancelled'
  where reservation.id = p_reservation_id
    and reservation.status = 'confirmed'
  returning reservation.* into cancelled_reservation;

  if not found then
    raise exception 'This reservation cannot be cancelled.' using errcode = 'P0002';
  end if;

  return cancelled_reservation;
end;
$$;

-- 4. private.booking_slots: same narrowing. Needs no special-casing for 'completed' --
-- a completed reservation's end_at is necessarily in the past, so it could never
-- overlap a future availability query regardless of this filter.
create or replace function private.booking_slots(p_listing_id uuid, p_booking_date date)
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
          and r.status = 'confirmed'
          and r.start_at < ((p_booking_date + make_time(e, 0, 0)) at time zone yard.timezone)
          and r.end_at > ((p_booking_date + make_time(s, 0, 0)) at time zone yard.timezone)
      ) order by s, e;
end;
$$;

-- 5. The sweep itself. SECURITY DEFINER is safe here for the same reason it's safe for
-- booking_slots: the condition is objective, time-based, and takes zero caller-supplied
-- input -- there is nothing for a caller to tamper with. Unscoped by design: it sweeps
-- every eligible row, not just the caller's own, the same way a real cron job would.
create or replace function private.complete_past_reservations()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reservations
  set status = 'completed'
  where status = 'confirmed'
    and end_at < now();
$$;
revoke all on function private.complete_past_reservations() from public, anon, authenticated;
grant execute on function private.complete_past_reservations() to authenticated;

-- Thin invoker wrapper -- this is the one exposed via PostgREST.
create or replace function public.complete_past_reservations()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_past_reservations();
$$;
revoke all on function public.complete_past_reservations() from public, anon;
grant execute on function public.complete_past_reservations() to authenticated;
