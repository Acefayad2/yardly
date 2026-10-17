begin;
do $$
declare
  provider uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  service_id uuid;
  equipment_id uuid;
  n integer;
  blocked boolean;
begin
  insert into auth.users (id) values (provider), (staff), (outsider);
  insert into public.marketplace_staff(user_id) values (staff);

  perform set_config('request.jwt.claim.sub', provider::text, true);
  execute 'set local role authenticated';
  insert into public.provider_profiles(owner_id, kind, business_name, category, service_area, summary, offerings, starting_price, sample_urls)
  values (provider, 'service', 'QA Photo Co', 'Photography', 'DMV', 'A complete private profile used only for rollback security verification.', array['Two-hour coverage'], 250, array['https://example.com/photo.jpg'])
  returning id into service_id;

  perform public.submit_provider_profile(service_id);
  select count(*) into n from public.provider_profiles where id = service_id and review_state = 'pending';
  if n <> 1 then raise exception 'FAIL: provider submission'; end if;
  update public.provider_profiles set business_name = 'Edited while pending' where id = service_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: provider edited pending profile'; end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.provider_profiles where id = service_id;
  if n <> 0 then raise exception 'FAIL: pending provider exposed'; end if;
  blocked := false;
  begin perform public.review_provider_profile(service_id, 'approved', null);
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: non-staff approved provider'; end if;

  perform set_config('request.jwt.claim.sub', staff::text, true);
  perform public.review_provider_profile(service_id, 'rejected', 'Clarify the edited-gallery delivery terms.');

  perform set_config('request.jwt.claim.sub', provider::text, true);
  update public.provider_profiles
  set summary = 'A corrected private profile with clarified edited-gallery delivery terms for review.'
  where id = service_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not edit an existing rejected draft'; end if;
  perform public.submit_provider_profile(service_id);
  select count(*) into n from public.provider_profiles where id = service_id and review_state = 'pending';
  if n <> 1 then raise exception 'FAIL: corrected provider profile could not be resubmitted'; end if;

  perform set_config('request.jwt.claim.sub', staff::text, true);
  perform public.review_provider_profile(service_id, 'approved', 'Corrected samples and service details reviewed.');

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.provider_profiles where id = service_id and review_state = 'approved';
  if n <> 1 then raise exception 'FAIL: approved provider not public'; end if;

  perform set_config('request.jwt.claim.sub', provider::text, true);
  blocked := false;
  begin
    insert into public.provider_profiles(owner_id, kind, business_name, category, service_area, summary, offerings, starting_price, sample_urls, delivery_details, setup_details, pickup_details)
    values (outsider, 'equipment', 'Forged Rentals', 'Equipment', 'DMV', 'A complete but forged provider profile that should never be inserted.', array['Chairs'], 5, array['https://example.com/chair.jpg'], 'Quoted', 'Quoted', 'Quoted');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: forged owner insert'; end if;
end;
$$;

reset role;

do $$
declare
  rental_owner uuid := gen_random_uuid();
  rental_id uuid;
  blocked boolean := false;
begin
  insert into auth.users(id) values (rental_owner);
  perform set_config('request.jwt.claim.sub', rental_owner::text, true);
  execute 'set local role authenticated';
  insert into public.provider_profiles(owner_id, kind, business_name, category, service_area, summary, offerings, starting_price, sample_urls, delivery_details, setup_details, pickup_details)
  values (rental_owner, 'equipment', 'QA Rentals', 'Tables and chairs', 'DMV', 'A complete equipment provider used only for rollback security verification.', array['Chair rentals'], 4, array['https://example.com/chair.jpg'], 'Quoted by distance', 'Setup is separately quoted', 'Pickup window is agreed')
  returning id into rental_id;
  begin perform public.submit_provider_profile(rental_id);
  exception when sqlstate '22023' then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment submitted without quantity'; end if;
  insert into public.provider_inventory_items(provider_id, name, quantity_available) values (rental_id, 'Folding chair', 60);
  perform public.submit_provider_profile(rental_id);
end;
$$;
rollback;
select 'PASS: provider marketplace review, public visibility, ownership, and equipment quantity regression suite; fixtures rolled back' as result;
