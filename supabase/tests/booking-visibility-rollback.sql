-- Isolated database only. Run after the versioned migrations; never against production.
-- Exercises the permissions this UI uses without adding policies or grants.
begin;
do $$
declare
  host uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid();
  booking public.reservations;
  thread uuid;
  n integer;
  lifecycle text;
  blocked boolean;
begin
  insert into auth.users(id) values (host), (guest), (outsider);
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings(id, host_id, title, location, neighborhood, timezone,
    space_type, hourly_price, min_hours, capacity, description, images, latitude, longitude, status)
  values (yard, host, 'Visibility fixture yard', 'Fixture City', 'Fixture Area', 'America/New_York',
    'Backyards', 50, 1, 5, 'Temporary isolated visibility regression fixture.',
    array['https://example.com/fixture.jpg'], 40, -74, 'draft');
  insert into public.listing_addresses(listing_id, street_address) values (yard, '1 Fixture Street');
  update public.listings set status = 'published' where id = yard;
  blocked := false;
  begin insert into public.conversations(listing_id, guest_id, host_id) values (yard, outsider, host);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: host initiated guest thread on published listing'; end if;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  booking := public.create_reservation(yard, current_date + 30, '14:00', '16:00', 2);
  insert into public.conversations(listing_id, guest_id, host_id) values (yard, guest, host) returning id into thread;
  insert into public.messages(conversation_id, sender_id, body) values (thread, guest, 'Before pause');

  foreach lifecycle in array array['paused', 'archived'] loop
    perform set_config('request.jwt.claim.sub', host::text, true);
    update public.listings set status = lifecycle where id = yard;
    select count(*) into n from public.reservations r inner join public.listings l on l.id = r.listing_id
      where r.id = booking.id and l.host_id = host;
    if n <> 1 then raise exception 'FAIL: host reservation hidden for %', lifecycle; end if;
    insert into public.messages(conversation_id, sender_id, body) values (thread, host, 'Host reply after ' || lifecycle);
    select count(*) into n from public.messages where conversation_id = thread
      and body in ('Before pause', 'Host reply after ' || lifecycle);
    if n <> 2 then raise exception 'FAIL: host cannot read old/new messages for %', lifecycle; end if;

    perform set_config('request.jwt.claim.sub', guest::text, true);
    select count(*) into n from public.listings where id = yard;
    if n <> 0 then raise exception 'FAIL: unavailable listing exposed'; end if;
    select count(*) into n from public.reservations where id = booking.id and listing_title = 'Visibility fixture yard';
    if n <> 1 then raise exception 'FAIL: booking snapshot hidden'; end if;
    select count(*) into n from public.conversations c left join public.listings l on l.id = c.listing_id
      where c.id = thread and l.id is null;
    if n <> 1 then raise exception 'FAIL: left join lost authorized conversation'; end if;
    select count(*) into n from public.conversations c inner join public.listings l on l.id = c.listing_id where c.id = thread;
    if n <> 0 then raise exception 'FAIL: inner join regression fixture invalid'; end if;
    select count(*) into n from public.listing_addresses where listing_id = yard;
    if n <> 1 then raise exception 'FAIL: confirmed guest address missing'; end if;
    insert into public.messages(conversation_id, sender_id, body) values (thread, guest, 'Guest reply after ' || lifecycle);
    select count(*) into n from public.messages where conversation_id = thread
      and body in ('Before pause', 'Host reply after ' || lifecycle, 'Guest reply after ' || lifecycle);
    if n <> 3 then raise exception 'FAIL: guest cannot read old/new messages for %', lifecycle; end if;
    select count(*) into n from public.profiles where id = host;
    if n <> 0 then raise exception 'FAIL: host private profile exposed'; end if;

    perform set_config('request.jwt.claim.sub', outsider::text, true);
    select count(*) into n from public.conversations c left join public.listings l on l.id = c.listing_id where c.id = thread;
    if n <> 0 then raise exception 'FAIL: outsider read conversation'; end if;
    select count(*) into n from public.messages where conversation_id = thread;
    if n <> 0 then raise exception 'FAIL: outsider read messages'; end if;
    select count(*) into n from public.reservations where id = booking.id;
    if n <> 0 then raise exception 'FAIL: outsider read booking'; end if;
    blocked := false;
    begin insert into public.conversations(listing_id, guest_id, host_id) values (yard, outsider, host);
    exception when insufficient_privilege then blocked := true; end;
    if not blocked then raise exception 'FAIL: new thread allowed on unavailable listing'; end if;
    perform set_config('request.jwt.claim.sub', host::text, true);
    select count(*) into n from public.messages where conversation_id = thread and body = 'Guest reply after ' || lifecycle;
    if n <> 1 then raise exception 'FAIL: host cannot read latest guest reply for %', lifecycle; end if;
    blocked := false;
    begin insert into public.conversations(listing_id, guest_id, host_id) values (yard, outsider, host);
    exception when insufficient_privilege then blocked := true; end;
    if not blocked then raise exception 'FAIL: host initiated guest thread'; end if;
    select count(*) into n from public.profiles where id = guest;
    if n <> 0 then raise exception 'FAIL: guest private profile exposed'; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: booking snapshots and participant messages survive paused/archived listings; private data remains restricted' as result;
