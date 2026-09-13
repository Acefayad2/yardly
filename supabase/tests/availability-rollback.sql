-- Transactional fixtures only; safe to run as database owner. No external effects.
begin;
do $$
declare
  host uuid := gen_random_uuid(); guest uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid(); draft uuid := gen_random_uuid();
  day date := current_date + 30; booked public.reservations; n integer; rejected boolean;
begin
  insert into auth.users(id) values(host), (guest), (outsider);
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,timezone,images,latitude,longitude,status,description)
  values(yard,host,'QA availability yard','Test city','Backyards',20,2,5,'America/Los_Angeles',array['https://example.com/test.jpg'],34,-118,'published','Temporary rollback fixture, never committed.'),
    (draft,host,'QA availability draft','Test city','Backyards',20,2,5,'America/Los_Angeles','{}',null,null,'draft','Temporary rollback fixture, never committed.');
  update public.listings set weekly_hours = '[[10,18],[10,18],[10,18],[10,18],[10,18],[10,18],[10,18]]', blocked_dates = array[day+1] where id = yard;
  rejected := false;
  begin update public.listings set weekly_hours = '[null]' where id = yard;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: invalid schedule accepted'; end if;
  rejected := false;
  begin update public.listings set weekly_hours = '[[10,11],null,null,null,null,null,null]' where id = yard;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: hours shorter than minimum accepted'; end if;
  rejected := false;
  begin update public.listings set weekly_hours = '[[10.5,18],null,null,null,null,null,null]' where id = yard;
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: fractional hours accepted'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.get_booking_slots(yard, day);
  if n <> 28 then raise exception 'FAIL: anonymous valid slots expected 28, got %', n; end if;
  select count(*) into n from public.get_booking_slots(yard, day+1);
  if n <> 0 then raise exception 'FAIL: blocked date exposed slots'; end if;
  select count(*) into n from public.get_booking_slots(draft, day);
  if n <> 0 then raise exception 'FAIL: draft availability exposed'; end if;
  select count(*) into n from public.get_booking_slots(yard, current_date-1);
  if n <> 0 then raise exception 'FAIL: past slots exposed'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', guest::text, true);
  update public.listings set blocked_dates = '{}' where id = yard;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: guest edited availability'; end if;
  rejected := false;
  begin perform public.create_reservation(yard, day+1, '10:00', '12:00', 2);
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: booking on blocked date'; end if;
  rejected := false;
  begin perform public.create_reservation(yard, day, '08:00', '10:00', 2);
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: booking before opening'; end if;
  rejected := false;
  begin perform public.create_reservation(yard, day, '17:00', '19:00', 2);
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: booking after closing'; end if;
  rejected := false;
  begin insert into public.reservations(listing_id,guest_id,start_at,end_at,guests,subtotal,guest_fee,total,host_payout,status)
    values(yard,guest,(day+time '08:00') at time zone 'America/Los_Angeles',(day+time '10:00') at time zone 'America/Los_Angeles',2,40,4.8,44.8,40,'confirmed');
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: direct insert bypassed hours'; end if;
  booked := public.create_reservation(yard, day, '12:00', '14:00', 2);

  -- Other guests must see busy slots filtered without seeing private bookings.
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.reservations where id = booked.id;
  if n <> 0 then raise exception 'FAIL: private booking exposed'; end if;
  select count(*) into n from public.get_booking_slots(yard, day) where start_hour < 14 and end_hour > 12;
  if n <> 0 then raise exception 'FAIL: occupied slots shown to another guest'; end if;
  select count(*) into n from public.get_booking_slots(yard, day);
  if n <> 7 then raise exception 'FAIL: adjacent slots expected 7, got %', n; end if;

  perform set_config('request.jwt.claim.sub', guest::text, true);
  perform public.cancel_reservation(booked.id);
  select count(*) into n from public.get_booking_slots(yard, day);
  if n <> 28 then raise exception 'FAIL: cancellation did not release slots'; end if;
  booked := public.create_reservation(yard, day, '12:00', '14:00', 2);
  perform set_config('request.jwt.claim.sub', host::text, true);
  update public.listings set weekly_hours = jsonb_set(weekly_hours, array[extract(dow from day)::int::text], 'null') where id = yard;
  select count(*) into n from public.reservations where id = booked.id and status = 'confirmed';
  if n <> 1 then raise exception 'FAIL: schedule change altered an existing booking'; end if;
  select count(*) into n from public.get_booking_slots(yard, day);
  if n <> 0 then raise exception 'FAIL: closed weekday has slots'; end if;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  rejected := false;
  begin perform public.create_reservation(yard, day, '16:00', '18:00', 2);
  exception when sqlstate '22023' then rejected := true; end;
  if not rejected then raise exception 'FAIL: closed weekday booking allowed'; end if;
end;
$$;
rollback;
select 'PASS: weekly hours, blocked dates, permissions, slot privacy, cancellation, direct writes and existing bookings; fixtures rolled back' as result;
