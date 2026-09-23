-- Run as the database owner using psql -v ON_ERROR_STOP=1 -f this-file.sql.
-- Only random, transaction-local fixtures are touched. No emails or payments.
begin;
do $$
declare
  host uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid();
  past_reservation uuid;
  future_reservation uuid;
  cancelled_reservation uuid;
  n integer;
  st text;
begin
  insert into auth.users (id) values (host), (guest), (outsider);
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings (id, host_id, title, location, neighborhood, timezone, space_type, hourly_price, min_hours, capacity, description, images, latitude, longitude, status)
  values (yard, host, 'QA completion yard', 'Test city', 'Test area', 'America/Los_Angeles', 'Backyards', 19.99, 2, 5, 'Temporary regression fixture, never committed.', array['https://example.com/test.jpg'], 34, -118, 'published');
  insert into public.listing_addresses(listing_id, street_address) values (yard, '1 QA Fixture Way, Test City, TS 00000');

  -- Fixtures inserted directly (bypassing create_reservation, which forbids past starts)
  -- so we can control end_at precisely. Table owner can write any status directly.
  -- Fixed local times (14:00-16:00, safely inside the listing's default 8am-10pm hours)
  -- rather than "now() +/- N hours" -- that would drift outside opening hours and fail
  -- the availability trigger depending on what wall-clock hour the suite happens to run
  -- at, which is exactly the kind of flake this session has caught and fixed before.
  reset role;
  insert into public.reservations
    (id, listing_id, guest_id, start_at, end_at, guests, subtotal, guest_fee, total, host_payout, status,
     listing_title, listing_location, listing_image, listing_timezone)
  values
    (gen_random_uuid(), yard, guest,
     ((current_date - 30) + time '14:00') at time zone 'America/Los_Angeles',
     ((current_date - 30) + time '16:00') at time zone 'America/Los_Angeles',
     2, 39.98, 4.80, 44.78, 39.98, 'confirmed',
     'QA completion yard', 'Test city', 'https://example.com/test.jpg', 'America/Los_Angeles')
    returning id into past_reservation;
  insert into public.reservations
    (id, listing_id, guest_id, start_at, end_at, guests, subtotal, guest_fee, total, host_payout, status,
     listing_title, listing_location, listing_image, listing_timezone)
  values
    (gen_random_uuid(), yard, guest,
     ((current_date + 30) + time '14:00') at time zone 'America/Los_Angeles',
     ((current_date + 30) + time '16:00') at time zone 'America/Los_Angeles',
     2, 39.98, 4.80, 44.78, 39.98, 'confirmed',
     'QA completion yard', 'Test city', 'https://example.com/test.jpg', 'America/Los_Angeles')
    returning id into future_reservation;
  insert into public.reservations
    (id, listing_id, guest_id, start_at, end_at, guests, subtotal, guest_fee, total, host_payout, status,
     listing_title, listing_location, listing_image, listing_timezone)
  values
    (gen_random_uuid(), yard, guest,
     ((current_date - 20) + time '14:00') at time zone 'America/Los_Angeles',
     ((current_date - 20) + time '16:00') at time zone 'America/Los_Angeles',
     2, 39.98, 4.80, 44.78, 39.98, 'cancelled',
     'QA completion yard', 'Test city', 'https://example.com/test.jpg', 'America/Los_Angeles')
    returning id into cancelled_reservation;

  -- private.complete_past_reservations is not reachable via PostgREST (private schema
  -- isn't exposed), but confirm the grant itself is narrow anyway -- defense in depth,
  -- matching invariant 14's existing testing discipline for private.booking_slots.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    perform private.complete_past_reservations();
    raise exception 'FAIL: anon could execute the private completion sweep';
  exception when insufficient_privilege then null;
  end;

  -- An authenticated (but unrelated) caller can run the sweep -- it's a global side
  -- effect gated only on an objective time comparison, not on caller identity.
  reset role;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  perform public.complete_past_reservations();

  -- Read the results back as the guest who actually owns these rows -- outsider has no
  -- RLS visibility into them at all, so a status check run as outsider would silently
  -- see zero rows (st stays NULL, "NULL <> 'x'" is NULL, not true, so a broken sweep
  -- would pass unnoticed) rather than genuinely proving anything about the sweep.
  reset role;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';

  select status into st from public.reservations where id = past_reservation;
  if st is distinct from 'completed' then raise exception 'FAIL: past confirmed reservation did not become completed, status=%', st; end if;

  select status into st from public.reservations where id = future_reservation;
  if st is distinct from 'confirmed' then raise exception 'FAIL: future reservation was incorrectly touched, status=%', st; end if;

  select status into st from public.reservations where id = cancelled_reservation;
  if st is distinct from 'cancelled' then raise exception 'FAIL: cancelled reservation was incorrectly flipped to completed, status=%', st; end if;

  -- A completed reservation can no longer be cancelled -- deliberate consequence of
  -- narrowing cancel_reservation's eligibility filter to status = 'confirmed'.
  reset role;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';
  begin
    perform public.cancel_reservation(past_reservation);
    raise exception 'FAIL: a completed reservation was cancelled';
  exception when sqlstate 'P0002' then null;
  end;

  -- A still-future reservation remains cancellable as before.
  perform public.cancel_reservation(future_reservation);
  select status into st from public.reservations where id = future_reservation;
  if st is distinct from 'cancelled' then raise exception 'FAIL: future reservation could not be cancelled, status=%', st; end if;

  -- Running the sweep again is a no-op -- nothing left eligible, no errors.
  reset role;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';
  perform public.complete_past_reservations();
  select count(*) into n from public.reservations where listing_id = yard and status = 'completed';
  if n <> 1 then raise exception 'FAIL: re-running the sweep changed the completed count, found %', n; end if;

  raise notice 'PASS: past confirmed reservations complete on sweep, future and cancelled ones are untouched, a completed reservation can no longer be cancelled, and the sweep grant is narrow';
end $$;
rollback;
select 'PASS: reservation completion rollback suite completed' as result;
