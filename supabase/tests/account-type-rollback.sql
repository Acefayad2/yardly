-- Transactional fixtures only; safe to run as database owner. No external effects.
-- account_type is a UX capability flag, never an authorization boundary. These checks
-- fail loudly if anyone ever wires it into an RLS policy or a security definer function.
begin;
do $$
declare
  host uuid := gen_random_uuid(); guest uuid := gen_random_uuid();
  yard uuid := gen_random_uuid(); hidden uuid := gen_random_uuid();
  day date := current_date + 30; booked public.reservations; n integer; rejected boolean;
  host_type text; guest_type text;
begin
  insert into auth.users(id) values(host), (guest);

  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  -- The signup trigger already provisioned this row; update it rather than insert.
  update public.profiles set full_name = 'QA host' where id = host;
  -- A brand-new profile must default to 'guest': the client no longer sends the column.
  select account_type into host_type from public.profiles where id = host;
  if host_type <> 'guest' then raise exception 'FAIL: new profile did not default to guest, got %', host_type; end if;

  insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,timezone,images,latitude,longitude,status,description,neighborhood)
  values
    (yard,host,'QA account-type yard','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'published','Temporary rollback fixture, never committed.','Test area'),
    (hidden,host,'QA account-type draft','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'draft','Temporary rollback fixture, never committed.','Test area');
  insert into public.listing_addresses(listing_id, street_address) values(yard, '321 Capability Ln, Test City, TS 00000');

  -- A host whose flag says 'guest' keeps every ownership-derived power.
  update public.profiles set account_type = 'guest' where id = host;
  update public.listings set title = 'QA account-type yard renamed' where id = yard;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: account_type=guest stripped a real host of listing access'; end if;
  select count(*) into n from public.listing_addresses where listing_id = yard;
  if n <> 1 then raise exception 'FAIL: account_type=guest hid the host''s own private address'; end if;

  -- A non-host who claims 'both' gains nothing at all.
  perform set_config('request.jwt.claim.sub', guest::text, true);
  update public.profiles set full_name = 'QA guest', account_type = 'both' where id = guest;
  select count(*) into n from public.listings where id = hidden;
  if n <> 0 then raise exception 'FAIL: account_type=both exposed another host''s draft listing'; end if;
  update public.listings set title = 'Unauthorized edit' where id = yard;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: account_type=both allowed editing another host''s listing'; end if;
  rejected := false;
  begin insert into public.listing_addresses(listing_id, street_address) values(hidden, 'Should not be allowed, 99 St');
  exception when sqlstate '42501' then rejected := true; end;
  if not rejected then raise exception 'FAIL: account_type=both allowed writing another host''s private address'; end if;

  booked := public.create_reservation(yard, day, '10:00', '12:00', 2);
  perform set_config('request.jwt.claim.sub', host::text, true);
  select count(*) into n from public.reservations where id = booked.id;
  if n <> 1 then raise exception 'FAIL: account_type=guest hid the host''s own reservation'; end if;

  -- Nobody may rewrite someone else's capability flag.
  perform set_config('request.jwt.claim.sub', guest::text, true);
  update public.profiles set account_type = 'guest' where id = host;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a user rewrote another user''s account_type'; end if;

  -- The backfill migration demotes only profiles that have never owned a listing.
  execute 'reset role';
  update public.profiles set account_type = 'both' where id in (host, guest);
  update public.profiles p set account_type = 'guest'
  where p.account_type <> 'guest'
    and not exists (select 1 from public.listings l where l.host_id = p.id);
  select account_type into host_type from public.profiles where id = host;
  select account_type into guest_type from public.profiles where id = guest;
  if host_type <> 'both' then raise exception 'FAIL: backfill demoted a real host, got %', host_type; end if;
  if guest_type <> 'guest' then raise exception 'FAIL: backfill left a non-host marked as a host, got %', guest_type; end if;
end;
$$;
rollback;
select 'PASS: account_type is a capability flag only, grants and removes no access, and the backfill demotes only non-hosts; fixtures rolled back' as result;
