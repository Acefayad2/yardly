-- Transactional fixtures only; safe to run as database owner. No external effects.
begin;
do $$
declare
  host uuid := gen_random_uuid(); host2 uuid := gen_random_uuid();
  guest uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid(); yard2 uuid := gen_random_uuid(); bare uuid := gen_random_uuid();
  day date := current_date + 30; booked public.reservations; n integer; rejected boolean;
begin
  insert into auth.users(id) values(host), (host2), (guest), (outsider);

  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,timezone,images,latitude,longitude,status,description,neighborhood)
  values
    (yard,host,'QA address yard','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'published','Temporary rollback fixture, never committed.','Test area'),
    (bare,host,'QA address draft','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'draft','Temporary rollback fixture, never committed.','Test area');
  insert into public.listing_addresses(listing_id, street_address) values(yard, '123 Fixture Way, Test City, TS 00000');
  select count(*) into n from public.listing_addresses where listing_id = yard;
  if n <> 1 then raise exception 'FAIL: host could not read own address back'; end if;

  perform set_config('request.jwt.claim.sub', host2::text, true);
  insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,timezone,images,latitude,longitude,status,description,neighborhood)
  values(yard2,host2,'QA address yard 2','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'published','Temporary rollback fixture, never committed.','Test area');
  insert into public.listing_addresses(listing_id, street_address) values(yard2, '456 Other Fixture Rd, Test City, TS 00000');

  -- A host cannot write another host's private address.
  rejected := false;
  begin insert into public.listing_addresses(listing_id, street_address) values(yard, 'Should not be allowed, 789 St');
  exception when sqlstate '42501' then rejected := true; end;
  if not rejected then raise exception 'FAIL: host2 inserted an address for host''s listing'; end if;

  -- Too-short addresses are rejected by the CHECK constraint (test via update on an owned row).
  perform set_config('request.jwt.claim.sub', host::text, true);
  rejected := false;
  begin update public.listing_addresses set street_address = 'abc' where listing_id = yard;
  exception when sqlstate '23514' then rejected := true; end;
  if not rejected then raise exception 'FAIL: too-short address accepted'; end if;

  -- Publishing without a stored address is blocked; adding one unblocks it.
  rejected := false;
  begin update public.listings set status = 'published' where id = bare;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: listing published without a private address'; end if;
  insert into public.listing_addresses(listing_id, street_address) values(bare, '789 Backfill Ave, Test City, TS 00000');
  update public.listings set status = 'published' where id = bare;
  select count(*) into n from public.listings where id = bare and status = 'published';
  if n <> 1 then raise exception 'FAIL: publish still blocked after adding address'; end if;

  -- Anonymous visitors cannot query this table at all: no grant, not just RLS.
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  rejected := false;
  begin select count(*) into n from public.listing_addresses where listing_id = yard;
  exception when sqlstate '42501' then rejected := true; end;
  if not rejected then raise exception 'FAIL: anon could query the private address table'; end if;

  -- An unrelated authenticated user (no booking, not the host) sees nothing.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.listing_addresses where listing_id = yard;
  if n <> 0 then raise exception 'FAIL: unrelated user read a private address'; end if;

  -- Before booking, the guest sees nothing either.
  perform set_config('request.jwt.claim.sub', guest::text, true);
  select count(*) into n from public.listing_addresses where listing_id = yard;
  if n <> 0 then raise exception 'FAIL: unbooked guest read a private address'; end if;

  booked := public.create_reservation(yard, day, '10:00', '12:00', 2);

  -- A guest with a confirmed reservation sees the real address, and only for that listing.
  select count(*) into n from public.listing_addresses where listing_id = yard and street_address = '123 Fixture Way, Test City, TS 00000';
  if n <> 1 then raise exception 'FAIL: booked guest could not read the real address'; end if;
  select count(*) into n from public.listing_addresses where listing_id = yard2;
  if n <> 0 then raise exception 'FAIL: booked guest read a different listing''s address'; end if;

  -- Cancelling the booking revokes access.
  perform public.cancel_reservation(booked.id);
  select count(*) into n from public.listing_addresses where listing_id = yard;
  if n <> 0 then raise exception 'FAIL: cancelled guest still read the address'; end if;
end;
$$;
rollback;
select 'PASS: private address read/write scopes, publish guard and cancellation revoke; fixtures rolled back' as result;
