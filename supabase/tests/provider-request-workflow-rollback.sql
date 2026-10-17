begin;

do $$
declare
  provider_owner uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  rental_id uuid;
  inventory_id uuid;
  v_request_id uuid;
  v_second_request_id uuid;
  stale_quote_revision bigint;
  current_quote_revision bigint;
  n integer;
  blocked boolean;
begin
  insert into auth.users(id) values (provider_owner), (customer), (outsider);
  insert into public.provider_profiles(
    owner_id, kind, business_name, category, service_area, summary, offerings,
    starting_price, sample_urls, delivery_details, setup_details, pickup_details,
    review_state, submitted_at, reviewed_at
  ) values (
    provider_owner, 'equipment', 'Workflow QA Rentals', 'Tables and chairs', 'DMV',
    'A reviewed equipment provider used only for rollback workflow verification.',
    array['Chair rentals'], 4, array['https://example.com/chair.jpg'],
    'Quoted by distance', 'Setup is separately quoted', 'Pickup window is agreed',
    'approved', now(), now()
  ) returning id into rental_id;
  insert into public.provider_inventory_items(provider_id, name, quantity_available)
  values (rental_id, 'Folding chair', 80) returning id into inventory_id;

  perform set_config('request.jwt.claim.sub', customer::text, true);
  execute 'set local role authenticated';
  blocked := false;
  begin perform public.create_provider_request(rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60, 'Need seating delivered before the event begins.', null);
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment request accepted null items'; end if;
  blocked := false;
  begin perform public.create_provider_request(rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60, 'Need seating delivered before the event begins.', '[]'::jsonb);
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment request accepted empty items'; end if;
  blocked := false;
  begin perform public.create_provider_request(rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60, 'Need seating delivered before the event begins.', '{"inventory_item_id":"wrong type"}'::jsonb);
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment request accepted non-array items'; end if;
  blocked := false;
  begin perform public.create_provider_request(rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60, 'Need seating delivered before the event begins.', jsonb_build_array(jsonb_build_object('inventory_item_id', gen_random_uuid(), 'quantity', 1)));
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment request accepted foreign inventory identifier'; end if;
  blocked := false;
  begin perform public.create_provider_request(rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60, 'Need seating delivered before the event begins.', jsonb_build_array(jsonb_build_object('inventory_item_id', inventory_id, 'quantity', 81)));
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: equipment request accepted quantity above available inventory'; end if;

  select id into v_request_id from public.create_provider_request(
    rental_id, current_date + 30, '15:00', '20:00', 'Community Hall', 60,
    'Need seating delivered before the event begins.',
    jsonb_build_array(jsonb_build_object('inventory_item_id', inventory_id, 'quantity', 60, 'options', 'white; delivery requested'))
  );
  select count(*) into n from public.provider_requests where id = v_request_id and status = 'waiting_for_reply';
  if n <> 1 then raise exception 'FAIL: request did not start waiting for reply'; end if;
  select count(*) into n from public.provider_request_items where provider_request_items.request_id = v_request_id and quantity = 60;
  if n <> 1 then raise exception 'FAIL: equipment quantity and options were not recorded'; end if;
  select count(*) into n from public.provider_quotes where provider_quotes.request_id = v_request_id;
  if n <> 0 then raise exception 'FAIL: request unexpectedly created a quote or reservation'; end if;
  select quantity_available into n from public.provider_inventory_items where provider_id = rental_id;
  if n <> 80 then raise exception 'FAIL: request changed available inventory'; end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from public.provider_requests where id = v_request_id;
  if n <> 0 then raise exception 'FAIL: outsider can read request'; end if;
  blocked := false;
  begin perform public.quote_provider_request(v_request_id, 450, 100, 'Deposit is nonrefundable after seven days.', 'Sixty chairs, delivery, setup, and pickup.');
  exception when no_data_found or insufficient_privilege then blocked := true; when others then if sqlstate = 'P0002' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'FAIL: outsider quoted request'; end if;
  blocked := false;
  begin perform public.send_provider_request_message(v_request_id, 'I should not be able to join this request.');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: outsider sent message'; end if;

  perform set_config('request.jwt.claim.sub', provider_owner::text, true);
  perform public.quote_provider_request(v_request_id, 450, 100, 'Deposit is nonrefundable after seven days.', 'Sixty chairs, delivery, setup, and pickup.');
  select revision into stale_quote_revision from public.provider_quotes where request_id = v_request_id;
  perform public.quote_provider_request(v_request_id, 475, 125, 'Deposit is nonrefundable after seven days.', 'Sixty chairs, delivery, setup, pickup, and revised staffing.');
  select revision into current_quote_revision from public.provider_quotes where request_id = v_request_id;
  if current_quote_revision <> stale_quote_revision + 1 then raise exception 'FAIL: quote revision did not advance'; end if;
  select count(*) into n from public.provider_requests where id = v_request_id and status = 'quoted';
  if n <> 1 then raise exception 'FAIL: provider quote status'; end if;
  blocked := false;
  begin perform public.confirm_provider_request(v_request_id);
  exception when no_data_found then blocked := true; when others then if sqlstate = 'P0002' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'FAIL: provider confirmed before customer acceptance'; end if;

  perform set_config('request.jwt.claim.sub', customer::text, true);
  blocked := false;
  begin perform public.accept_provider_quote(v_request_id, current_quote_revision, false);
  exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: customer accepted without direct-payment acknowledgment'; end if;
  blocked := false;
  begin perform public.accept_provider_quote(v_request_id, stale_quote_revision, true);
  exception when serialization_failure then blocked := true; end;
  if not blocked then raise exception 'FAIL: customer accepted a stale quote revision'; end if;
  select count(*) into n from public.provider_quotes where request_id = v_request_id and accepted_at is not null;
  if n <> 0 then raise exception 'FAIL: stale quote attempt recorded acceptance'; end if;
  perform public.accept_provider_quote(v_request_id, current_quote_revision, true);
  select count(*) into n from public.provider_quotes
  where provider_quotes.request_id = v_request_id and accepted_at is not null and direct_payment_acknowledged_at is not null;
  if n <> 1 then raise exception 'FAIL: quote acceptance acknowledgment'; end if;
  blocked := false;
  begin perform public.confirm_provider_request(v_request_id);
  exception when no_data_found then blocked := true; when others then if sqlstate = 'P0002' then blocked := true; else raise; end if; end;
  if not blocked then raise exception 'FAIL: customer confirmed provider request'; end if;
  perform public.send_provider_request_message(v_request_id, 'Please confirm the delivery window.');

  perform set_config('request.jwt.claim.sub', provider_owner::text, true);
  perform public.send_provider_request_message(v_request_id, 'Delivery will arrive two hours before start.');
  perform public.confirm_provider_request(v_request_id);
  select count(*) into n from public.provider_requests where id = v_request_id and status = 'confirmed';
  if n <> 1 then raise exception 'FAIL: accepted request was not confirmed'; end if;
  select count(*) into n from public.provider_quotes
  where provider_quotes.request_id = v_request_id and revision = current_quote_revision and full_price = 475 and deposit_amount = 125 and confirmed_at is not null;
  if n <> 1 then raise exception 'FAIL: confirmed quote details'; end if;
  select count(*) into n from public.provider_request_messages where provider_request_messages.request_id = v_request_id;
  if n <> 2 then raise exception 'FAIL: participant messages'; end if;

  perform set_config('request.jwt.claim.sub', customer::text, true);
  select id into v_second_request_id from public.create_provider_request(
    rental_id, current_date + 31, '15:00', '20:00', 'Community Hall', 60,
    'Need another set of chairs for a second event.',
    jsonb_build_array(jsonb_build_object('inventory_item_id', inventory_id, 'quantity', 40, 'options', 'delivery requested'))
  );
  perform set_config('request.jwt.claim.sub', provider_owner::text, true);
  perform public.decline_provider_request(v_second_request_id);
  perform set_config('request.jwt.claim.sub', customer::text, true);
  perform public.close_provider_request(v_second_request_id);
  select count(*) into n from public.provider_requests where id = v_second_request_id and status = 'closed';
  if n <> 1 then raise exception 'FAIL: decline and close transitions'; end if;
end;
$$;

rollback;
select 'PASS: provider request, quote, acknowledgment, confirmation, messaging, RLS, and no-reservation regression suite; fixtures rolled back' as result;
