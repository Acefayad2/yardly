-- Run as the database owner using psql -v ON_ERROR_STOP=1 -f this-file.sql.
-- Only random, transaction-local fixtures are touched. No emails or payments.
begin;
do $$
declare
  host uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid();
  n integer;
  booking_day date := current_date + 30;
  active_reservation uuid;
begin
  insert into auth.users (id) values (host), (guest), (outsider);
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings (id, host_id, title, location, neighborhood, timezone, space_type, hourly_price, min_hours, capacity, description, images, latitude, longitude, status)
  values (yard, host, 'QA lifecycle yard', 'Test city', 'Test area', 'America/Los_Angeles', 'Backyards', 19.99, 2, 5, 'Temporary regression fixture, never committed.', array['https://example.com/test.jpg'], 34, -118, 'draft');
  insert into public.listing_addresses(listing_id, street_address) values (yard, '1 QA Fixture Way, Test City, TS 00000');

  -- draft -> archived succeeds.
  update public.listings set status = 'archived' where id = yard;
  select count(*) into n from public.listings where id = yard and status = 'archived';
  if n <> 1 then raise exception 'FAIL: draft to archived transition rejected'; end if;

  -- archived -> draft succeeds (re-enters the normal publish flow).
  update public.listings set status = 'draft' where id = yard;
  select count(*) into n from public.listings where id = yard and status = 'draft';
  if n <> 1 then raise exception 'FAIL: archived to draft transition rejected'; end if;

  -- archive again for the visibility assertions below.
  update public.listings set status = 'archived' where id = yard;

  -- Anonymous cannot see an archived listing.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.listings where id = yard;
  if n <> 0 then raise exception 'FAIL: anon could see an archived listing'; end if;

  -- A different authenticated user (not the host) cannot see it either.
  reset role;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.listings where id = yard;
  if n <> 0 then raise exception 'FAIL: a non-owner could see an archived listing'; end if;

  -- The owning host can still see their own archived listing.
  reset role;
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.listings where id = yard;
  if n <> 1 then raise exception 'FAIL: the host could not see their own archived listing'; end if;

  -- Republish for the capacity-guard assertions.
  update public.listings set status = 'published' where id = yard;

  -- Book 4 of 5 guest slots as the guest.
  reset role;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';
  active_reservation := (public.create_reservation(yard, booking_day, '14:00', '16:00', 4)).id;

  -- Host cannot reduce capacity below that reservation's guest count.
  reset role;
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  begin
    update public.listings set capacity = 3 where id = yard;
    raise exception 'FAIL: capacity was reduced below an active reservation''s guest count';
  exception when sqlstate '22023' then null;
  end;

  -- Host CAN raise capacity -- the guard is direction-aware, not a blanket freeze.
  update public.listings set capacity = 10 where id = yard;
  select count(*) into n from public.listings where id = yard and capacity = 10;
  if n <> 1 then raise exception 'FAIL: raising capacity was incorrectly blocked'; end if;

  -- Host CAN reduce capacity to a value still above every active reservation's guest count.
  update public.listings set capacity = 6 where id = yard;
  select count(*) into n from public.listings where id = yard and capacity = 6;
  if n <> 1 then raise exception 'FAIL: a safe capacity reduction was incorrectly blocked'; end if;

  -- Cancel the reservation, then the previously-blocked reduction succeeds.
  reset role;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';
  perform public.cancel_reservation(active_reservation);

  reset role;
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  update public.listings set capacity = 3 where id = yard;
  select count(*) into n from public.listings where id = yard and capacity = 3;
  if n <> 1 then raise exception 'FAIL: capacity reduction still blocked after the conflicting reservation was cancelled'; end if;

  raise notice 'PASS: listing archive/restore transitions, archived-listing visibility, and the capacity-vs-reservation guard all behave correctly';
end $$;
rollback;
select 'PASS: listing lifecycle rollback suite completed' as result;
