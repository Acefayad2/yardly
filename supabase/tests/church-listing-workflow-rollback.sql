begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); customer_id uuid := gen_random_uuid(); staff_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  church_id uuid; request_id uuid; n integer; blocked boolean;
begin
  insert into auth.users(id) values (owner_id), (customer_id), (staff_id), (outsider_id);
  insert into public.marketplace_staff(user_id) values (staff_id);

  perform set_config('request.jwt.claim.sub', owner_id::text, true); execute 'set local role authenticated';
  insert into public.church_listings(owner_id, church_name, space_name, location, description, capacity, published_price, amenities, rules, booking_contact_name, photo_urls)
  values (owner_id, 'QA Community Church', 'Fellowship Hall', 'Washington, DC', 'A flexible church-owned hall used only for rollback workflow verification.', 120, '$150 per hour', array['Kitchen','Parking'], 'No smoking; cleanup required.', 'Church office', array['https://example.com/hall.jpg'])
  returning id into church_id;
  perform public.record_church_photo_permission(church_id, true, 'Authorized in writing by the church representative for Yardly publication.');
  perform public.submit_church_listing(church_id);

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.church_listings where id = church_id;
  if n <> 0 then raise exception 'FAIL: pending church listing exposed'; end if;
  blocked := false;
  begin perform public.review_church_listing(church_id, 'approved', null); exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: outsider reviewed church listing'; end if;

  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  perform public.review_church_listing(church_id, 'rejected', 'Clarify the published price and cleanup rules.');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  update public.church_listings set published_price = '$175 per hour', rules = 'No smoking; cleanup and key return are required.' where id = church_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not edit a rejected listing'; end if;
  perform public.record_church_photo_permission(church_id, true, 'Permission reconfirmed in writing after the corrected copy and photos were reviewed.');
  perform public.submit_church_listing(church_id);
  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  perform public.review_church_listing(church_id, 'approved', null);
  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.church_listings where id = church_id and review_state = 'approved';
  if n <> 1 then raise exception 'FAIL: approved church listing not public'; end if;

  perform set_config('request.jwt.claim.sub', customer_id::text, true);
  select id into request_id from public.create_church_event_request(church_id, current_date + 30, '15:00', '19:00', 80, 'Community dinner', 'Dinner and program for local families.');
  select count(*) into n from public.church_event_requests where id = request_id and status = 'waiting_for_reply';
  if n <> 1 then raise exception 'FAIL: church request status'; end if;
  blocked := false;
  begin perform public.decide_church_event_request(request_id, 'accepted'); exception when no_data_found then blocked := true; end;
  if not blocked then raise exception 'FAIL: customer decided church request'; end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.church_event_requests where id = request_id;
  if n <> 0 then raise exception 'FAIL: outsider read church request'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform public.decide_church_event_request(request_id, 'accepted');
  select count(*) into n from public.church_event_requests where id = request_id and status = 'accepted';
  if n <> 1 then raise exception 'FAIL: church owner acceptance'; end if;
  perform public.record_church_photo_permission(church_id, false, 'Permission withdrawn by the church representative before further publication.');
  blocked := false;
  begin perform public.submit_church_listing(church_id); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: revoked photo permission allowed resubmission'; end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.church_listings where id = church_id;
  if n <> 0 then raise exception 'FAIL: listing remained public after photo permission withdrawal'; end if;
end;
$$;
rollback;
select 'PASS: church ownership, photo permission, review, public visibility, and event-request decisions; fixtures rolled back' as result;
