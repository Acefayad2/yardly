-- Run as the database owner using psql -v ON_ERROR_STOP=1 -f this-file.sql.
-- Only random, transaction-local fixtures are touched. No emails or payments.
begin;
do $$
declare
  host uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  yard uuid := gen_random_uuid();
  other_yard uuid := gen_random_uuid();
  booking public.reservations;
  thread uuid;
  n integer;
  blocked boolean;
  booking_day date := current_date + 30;
begin
  insert into auth.users (id) values (host), (guest), (outsider);
  perform set_config('request.jwt.claim.sub', host::text, true);
  execute 'set local role authenticated';
  insert into public.listings (id, host_id, title, location, neighborhood, timezone, space_type, hourly_price, min_hours, capacity, description, images, latitude, longitude, status)
  values (yard, host, 'QA rollback yard', 'Test city', 'Test area', 'America/Los_Angeles', 'Backyards', 19.99, 2, 5, 'Temporary regression fixture, never committed.', array['https://example.com/test.jpg'], 34, -118, 'published'),
         (other_yard, host, 'QA rollback second yard', 'Test city', 'Test area', 'America/Los_Angeles', 'Backyards', 19.99, 2, 5, 'Temporary regression fixture, never committed.', array['https://example.com/test.jpg'], 34, -118, 'draft');
  -- A published listing needs a private address on file (see the publish-guard trigger).
  insert into public.listing_addresses(listing_id, street_address) values
    (yard, '1 QA Fixture Way, Test City, TS 00000'), (other_yard, '2 QA Fixture Way, Test City, TS 00000');

  blocked := false;
  begin perform public.create_reservation(yard, booking_day, '14:00', '16:00', 2);
  exception when sqlstate '22023' then blocked := true; end;
  if not blocked then raise exception 'FAIL: host self-booking'; end if;

  perform set_config('request.jwt.claim.sub', guest::text, true);
  select count(*) into n from public.listings where id = other_yard;
  if n <> 0 then raise exception 'FAIL: draft listing privacy'; end if;
  update public.listings set title = 'Unauthorized edit' where id = yard;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: guest edited host listing'; end if;

  booking := public.create_reservation(yard, booking_day, '14:00', '16:00', 2);
  if booking.subtotal <> 39.98 or booking.guest_fee <> 4.80 or booking.total <> 44.78 then raise exception 'FAIL: cent-accurate pricing'; end if;
  if booking.listing_timezone <> 'America/Los_Angeles' or (booking.start_at at time zone booking.listing_timezone)::time <> time '14:00' then raise exception 'FAIL: timezone snapshot'; end if;

  blocked := false;
  begin perform public.create_reservation(yard, booking_day, '15:00', '17:00', 2);
  exception when exclusion_violation then blocked := true; end;
  if not blocked then raise exception 'FAIL: overlapping reservation accepted'; end if;

  blocked := false;
  begin perform public.create_reservation(yard, booking_day, '18:00', '20:00', 6);
  exception when sqlstate '22023' then blocked := true; end;
  if not blocked then raise exception 'FAIL: guest capacity'; end if;
  blocked := false;
  begin perform public.create_reservation(yard, booking_day, '21:00', '01:00', 2);
  exception when sqlstate '22023' then blocked := true; end;
  if not blocked then raise exception 'FAIL: overnight booking'; end if;
  blocked := false;
  begin perform public.create_reservation(yard, current_date - 1, '14:00', '16:00', 2);
  exception when sqlstate '22023' then blocked := true; end;
  if not blocked then raise exception 'FAIL: past booking'; end if;

  insert into public.saved_listings(user_id, listing_key) values (guest, yard::text);
  select count(*) into n from public.saved_listings where user_id = guest and listing_key = yard::text;
  if n <> 1 then raise exception 'FAIL: wishlist persistence'; end if;
  insert into public.conversations(listing_id, guest_id, host_id, reservation_id)
  values (yard, guest, host, booking.id) returning id into thread;
  insert into public.messages(conversation_id, sender_id, body) values (thread, guest, 'QA test message');

  -- Neither an unrelated host nor an unrelated reservation is acceptable.
  blocked := false;
  begin insert into public.conversations(listing_id, guest_id, host_id) values (yard, guest, outsider);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: forged conversation host accepted'; end if;
  perform set_config('request.jwt.claim.sub', host::text, true);
  update public.listings set status = 'published' where id = other_yard;
  select count(*) into n from public.messages where conversation_id = thread;
  if n <> 1 then raise exception 'FAIL: host cannot read guest message'; end if;
  insert into public.messages(conversation_id, sender_id, body) values (thread, host, 'QA host reply');
  perform set_config('request.jwt.claim.sub', guest::text, true);
  blocked := false;
  begin insert into public.conversations(listing_id, guest_id, host_id, reservation_id) values (other_yard, guest, host, booking.id);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: mismatched conversation reservation accepted'; end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.messages where conversation_id = thread;
  if n <> 0 then raise exception 'FAIL: private message exposed'; end if;
  select count(*) into n from public.saved_listings where user_id = guest;
  if n <> 0 then raise exception 'FAIL: private wishlist exposed'; end if;
  select count(*) into n from public.reservations where id = booking.id;
  if n <> 0 then raise exception 'FAIL: private booking exposed'; end if;
  blocked := false;
  begin insert into public.messages(conversation_id, sender_id, body) values (thread, outsider, 'Unauthorized');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: outsider sent message'; end if;
  blocked := false;
  begin perform public.cancel_reservation(booking.id);
  exception when no_data_found then blocked := true; end;
  if not blocked then raise exception 'FAIL: outsider cancelled booking'; end if;

  perform set_config('request.jwt.claim.sub', guest::text, true);
  perform public.cancel_reservation(booking.id);
  select count(*) into n from public.reservations where id = booking.id and status = 'cancelled';
  if n <> 1 then raise exception 'FAIL: guest cancellation'; end if;
  perform public.create_reservation(yard, booking_day, '14:00', '16:00', 2);
  perform public.create_reservation(yard, booking_day, '16:00', '18:00', 2);
  delete from public.saved_listings where user_id = guest and listing_key = yard::text;
  select count(*) into n from public.saved_listings where user_id = guest;
  if n <> 0 then raise exception 'FAIL: wishlist removal'; end if;
end;
$$;
rollback;
select 'PASS: marketplace booking, pricing, timezone, cancellation, messaging and wishlist regression suite; fixtures rolled back' as result;
