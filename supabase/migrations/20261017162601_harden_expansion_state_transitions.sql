-- Bind customer quote acceptance to the exact provider-authored revision.
alter table public.provider_request_items
  add column inventory_item_id uuid references public.provider_inventory_items(id) on delete restrict;

alter table public.provider_request_items
  add constraint provider_request_items_unique_inventory unique (request_id, inventory_item_id);

create or replace function public.create_provider_request(
  p_provider_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_location text,
  p_guest_count integer,
  p_needs text,
  p_items jsonb default '[]'::jsonb
)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_provider public.provider_profiles%rowtype;
  selected_inventory public.provider_inventory_items%rowtype;
  created_request public.provider_requests%rowtype;
  item jsonb;
  inventory_id uuid;
  requested_quantity integer;
begin
  if caller_id is null then raise exception 'Sign in before requesting a quote.' using errcode = '42501'; end if;
  select * into selected_provider from public.provider_profiles where id = p_provider_id and review_state = 'approved';
  if not found then raise exception 'This provider is not available for requests.' using errcode = 'P0002'; end if;
  if selected_provider.owner_id = caller_id then raise exception 'Providers cannot request their own services.' using errcode = '22023'; end if;
  if p_event_date < current_date then raise exception 'Choose a future event date.' using errcode = '22023'; end if;
  if p_end_time <= p_start_time then raise exception 'The end time must be after the start time.' using errcode = '22023'; end if;
  if p_guest_count < 1 or p_guest_count > 100000 then raise exception 'Enter a valid guest count.' using errcode = '22023'; end if;
  if char_length(btrim(p_event_location)) < 3 or char_length(btrim(p_needs)) < 10 then raise exception 'Complete the event location and needs.' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Equipment items must be a JSON array.' using errcode = '22023';
  end if;
  if selected_provider.kind = 'equipment' and jsonb_array_length(p_items) < 1 then
    raise exception 'Add at least one equipment item and quantity.' using errcode = '22023';
  end if;
  if selected_provider.kind <> 'equipment' and jsonb_array_length(p_items) > 0 then
    raise exception 'Equipment items can only be requested from an equipment provider.' using errcode = '22023';
  end if;

  insert into public.provider_requests(provider_id, customer_id, event_date, start_time, end_time, event_location, guest_count, needs)
  values (p_provider_id, caller_id, p_event_date, p_start_time, p_end_time, btrim(p_event_location), p_guest_count, btrim(p_needs))
  returning * into created_request;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or coalesce(item->>'inventory_item_id', '') = ''
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Each equipment item needs a valid inventory identifier and quantity.' using errcode = '22023';
    end if;
    begin
      inventory_id := (item->>'inventory_item_id')::uuid;
      requested_quantity := (item->>'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each equipment item needs a valid inventory identifier and quantity.' using errcode = '22023';
    end;
    select * into selected_inventory
    from public.provider_inventory_items
    where id = inventory_id and provider_id = p_provider_id;
    if not found or requested_quantity < 1 or requested_quantity > selected_inventory.quantity_available then
      raise exception 'Choose listed equipment and a quantity no greater than currently available.' using errcode = '22023';
    end if;
    insert into public.provider_request_items(request_id, inventory_item_id, item_name, quantity, options)
    values (created_request.id, inventory_id, selected_inventory.name, requested_quantity, left(btrim(coalesce(item->>'options', '')), 1000));
  end loop;
  return created_request;
end;
$$;

alter table public.provider_quotes
  add column revision bigint not null default 1 check (revision > 0);

create or replace function public.quote_provider_request(
  p_request_id uuid,
  p_full_price numeric,
  p_deposit_amount numeric,
  p_cancellation_terms text,
  p_inclusions text
)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  select request.* into selected_request
  from public.provider_requests request
  join public.provider_profiles provider on provider.id = request.provider_id
  where request.id = p_request_id
    and provider.owner_id = (select auth.uid())
    and request.status in ('waiting_for_reply', 'quoted')
  for update of request;
  if not found then raise exception 'This request cannot be quoted.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.provider_quotes where request_id = p_request_id and accepted_at is not null) then
    raise exception 'An accepted quote cannot be changed.' using errcode = '22023';
  end if;
  if p_full_price < 0 or p_deposit_amount < 0 or p_deposit_amount > p_full_price then
    raise exception 'Enter valid quote and deposit amounts.' using errcode = '22023';
  end if;
  if char_length(btrim(p_cancellation_terms)) < 10 or char_length(btrim(p_inclusions)) < 10 then
    raise exception 'Include cancellation terms and what the quote includes.' using errcode = '22023';
  end if;

  insert into public.provider_quotes(request_id, full_price, deposit_amount, cancellation_terms, inclusions)
  values (p_request_id, p_full_price, p_deposit_amount, btrim(p_cancellation_terms), btrim(p_inclusions))
  on conflict (request_id) do update set
    full_price = excluded.full_price,
    deposit_amount = excluded.deposit_amount,
    cancellation_terms = excluded.cancellation_terms,
    inclusions = excluded.inclusions,
    quoted_at = now(),
    revision = public.provider_quotes.revision + 1;

  update public.provider_requests set status = 'quoted' where id = p_request_id returning * into selected_request;
  return selected_request;
end;
$$;

revoke all on function public.accept_provider_quote(uuid, boolean) from public, anon, authenticated;
drop function public.accept_provider_quote(uuid, boolean);

create function public.accept_provider_quote(
  p_request_id uuid,
  p_expected_revision bigint,
  p_direct_payment_acknowledged boolean
)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  if p_direct_payment_acknowledged is not true then
    raise exception 'Confirm payment is handled directly with the provider.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Reload the latest quote before accepting it.' using errcode = '22023';
  end if;

  select * into selected_request
  from public.provider_requests
  where id = p_request_id and customer_id = (select auth.uid()) and status = 'quoted'
  for update;
  if not found then raise exception 'This quote cannot be accepted.' using errcode = 'P0002'; end if;

  update public.provider_quotes
  set accepted_at = now(), direct_payment_acknowledged_at = now()
  where request_id = p_request_id
    and revision = p_expected_revision
    and accepted_at is null;
  if not found then
    raise exception 'The provider changed this quote. Reload and review the latest price and terms before accepting.' using errcode = '40001';
  end if;
  return selected_request;
end;
$$;

revoke all on function public.quote_provider_request(uuid, numeric, numeric, text, text) from public, anon;
revoke all on function public.accept_provider_quote(uuid, bigint, boolean) from public, anon;
grant execute on function public.quote_provider_request(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.accept_provider_quote(uuid, bigint, boolean) to authenticated;

-- A source check is publishable only when it succeeded for the current saved content.
alter table public.community_spaces
  add column content_revision bigint not null default 1 check (content_revision > 0),
  add column verified_revision bigint check (verified_revision is null or verified_revision > 0);

alter table public.community_spaces
  add constraint community_spaces_verification_revision_not_future
  check (verified_revision is null or verified_revision <= content_revision);

update public.community_spaces
set is_published = false, last_checked_at = null, last_checked_by = null, verified_revision = null;

drop policy "community_space_sources_fresh_public_or_staff_select" on public.community_space_sources;
create policy "community_space_sources_fresh_public_or_staff_select"
on public.community_space_sources for select to anon, authenticated
using (
  exists (
    select 1 from public.community_spaces
    where id = community_space_sources.space_id
      and is_published
      and verified_revision = content_revision
      and last_checked_at >= now() - interval '7 days'
  )
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create or replace function public.save_community_space(
  p_id uuid, p_name text, p_space_type text, p_location text, p_capacity integer,
  p_amenities text[], p_published_pricing text, p_restrictions text,
  p_official_url text, p_source_name text
)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can manage community spaces.' using errcode = '42501';
  end if;
  if p_space_type not in ('park', 'gym', 'recreation_center', 'community_center', 'other')
    or char_length(btrim(p_name)) < 2 or char_length(btrim(p_location)) < 3
    or (p_capacity is not null and (p_capacity < 1 or p_capacity > 100000)) or coalesce(cardinality(p_amenities), 0) < 1
    or char_length(btrim(p_published_pricing)) < 2 or char_length(btrim(p_restrictions)) < 2
    or p_official_url !~ '^https://[^[:space:]/]+' or char_length(btrim(p_source_name)) < 2 then
    raise exception 'Complete the directory entry with an official HTTPS source.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.community_spaces(name, space_type, location, capacity, amenities, published_pricing, restrictions, source_name, created_by)
    values (btrim(p_name), p_space_type, btrim(p_location), p_capacity, p_amenities, btrim(p_published_pricing), btrim(p_restrictions), btrim(p_source_name), (select auth.uid()))
    returning * into result;
  else
    update public.community_spaces set
      name = btrim(p_name), space_type = p_space_type, location = btrim(p_location), capacity = p_capacity,
      amenities = p_amenities, published_pricing = btrim(p_published_pricing), restrictions = btrim(p_restrictions),
      source_name = btrim(p_source_name), content_revision = content_revision + 1,
      is_published = false, last_checked_at = null, last_checked_by = null, verified_revision = null
    where id = p_id returning * into result;
    if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  end if;
  insert into public.community_space_sources(space_id, official_url) values (result.id, p_official_url)
  on conflict (space_id) do update set official_url = excluded.official_url, updated_at = now();
  return result;
end;
$$;

revoke all on function public.record_community_space_check(uuid, text, text) from public, anon, authenticated;
drop function public.record_community_space_check(uuid, text, text);

create function public.record_community_space_check(
  p_space_id uuid,
  p_expected_revision bigint,
  p_source_status text,
  p_check_note text
)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can verify community spaces.' using errcode = '42501';
  end if;
  if p_source_status not in ('current', 'changed', 'unavailable') or char_length(btrim(p_check_note)) < 3 then
    raise exception 'Record the source status and verification note.' using errcode = '22023';
  end if;

  select * into result from public.community_spaces where id = p_space_id for update;
  if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  if result.content_revision is distinct from p_expected_revision then
    raise exception 'This directory entry changed. Reload and review the latest saved details before recording a source check.' using errcode = '40001';
  end if;

  insert into public.community_space_checks(space_id, checked_by, source_status, check_note)
  values (p_space_id, (select auth.uid()), p_source_status, btrim(p_check_note));

  if p_source_status = 'current' then
    update public.community_spaces
    set last_checked_at = now(), last_checked_by = (select auth.uid()), verified_revision = content_revision
    where id = p_space_id returning * into result;
  else
    update public.community_spaces
    set is_published = false, verified_revision = null
    where id = p_space_id returning * into result;
  end if;
  return result;
end;
$$;

revoke all on function public.record_community_space_check(uuid, bigint, text, text) from public, anon;
grant execute on function public.record_community_space_check(uuid, bigint, text, text) to authenticated;

create or replace function public.set_community_space_published(p_space_id uuid, p_published boolean)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can publish community spaces.' using errcode = '42501';
  end if;

  select * into result from public.community_spaces where id = p_space_id for update;
  if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  if p_published is null then
    raise exception 'Choose whether this directory entry should be published.' using errcode = '22023';
  end if;
  if p_published is true and (
    result.verified_revision = result.content_revision
    and result.last_checked_at >= now() - interval '7 days'
  ) is not true then
    raise exception 'Verify the current saved entry against the official source before publishing.' using errcode = '22023';
  end if;

  update public.community_spaces set is_published = p_published where id = p_space_id returning * into result;
  return result;
end;
$$;

-- Serialize every assistance transition on its parent case and fail closed after
-- cancellation, expiry, confirmation, or the service deadline.
alter table public.booking_assistance_applications
  add column revision bigint not null default 1 check (revision > 0),
  add column outcome text not null default 'active' check (outcome in ('active', 'unsuccessful', 'confirmed')),
  add column resolved_at timestamptz,
  add column resolution_reason text;

alter table public.booking_assistance_applications
  add constraint booking_assistance_application_resolution_consistent check (
    (outcome = 'active' and resolved_at is null and resolution_reason is null)
    or (outcome = 'unsuccessful' and resolved_at is not null and char_length(btrim(resolution_reason)) >= 3)
    or (outcome = 'confirmed' and resolved_at is not null and confirmed_at is not null)
  );

create function public.guard_booking_assistance_application_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.venue_name is distinct from old.venue_name
    or new.official_url is distinct from old.official_url
    or new.application_text is distinct from old.application_text
    or new.requires_venue_payment is distinct from old.requires_venue_payment
    or new.requires_permit is distinct from old.requires_permit then
    if old.submitted_at is not null or old.confirmed_at is not null or old.outcome <> 'active' then
      raise exception 'A submitted or resolved application cannot be materially edited.' using errcode = '22023';
    end if;
    new.revision := old.revision + 1;
    new.customer_approved_at := null;
  elsif new.revision is distinct from old.revision then
    raise exception 'Application revisions are managed by the database.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger booking_assistance_application_revision_guard
before update on public.booking_assistance_applications
for each row execute function public.guard_booking_assistance_application_revision();

revoke all on function public.guard_booking_assistance_application_revision() from public, anon, authenticated;

create function public.lock_active_booking_assistance_case(p_case_id uuid, p_allowed_statuses text[])
returns public.booking_assistance_cases
language plpgsql security invoker set search_path = ''
as $$
declare result public.booking_assistance_cases%rowtype;
begin
  select * into result from public.booking_assistance_cases where id = p_case_id for update;
  if not found then raise exception 'This assistance case does not exist.' using errcode = 'P0002'; end if;
  if result.status in ('closed', 'expired', 'confirmed')
    or result.service_deadline < current_date
    or (result.status = any(p_allowed_statuses)) is not true then
    raise exception 'This assistance case is no longer active for that step.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.lock_active_booking_assistance_case(uuid, text[]) from public, anon, authenticated;

create or replace function public.add_booking_assistance_suggestion(p_case_id uuid, p_venue_name text, p_official_url text, p_rationale text)
returns public.booking_assistance_suggestions language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_suggestions%rowtype; next_position integer;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can prepare suggestions.' using errcode = '42501'; end if;
  perform public.lock_active_booking_assistance_case(p_case_id, array['intake','suggestions_ready']);
  select count(*) + 1 into next_position from public.booking_assistance_suggestions where case_id = p_case_id;
  if next_position > 3 then raise exception 'This case cannot accept another suggestion.' using errcode = '22023'; end if;
  insert into public.booking_assistance_suggestions(case_id, position, venue_name, official_url, rationale, prepared_by)
  values (p_case_id, next_position, btrim(p_venue_name), p_official_url, btrim(p_rationale), (select auth.uid())) returning * into result;
  update public.booking_assistance_cases set status = 'suggestions_ready' where id = p_case_id;
  return result;
end $$;

create or replace function public.prepare_booking_assistance_application(
  p_case_id uuid, p_venue_name text, p_official_url text, p_application_text text,
  p_requires_venue_payment boolean, p_requires_permit boolean
)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; next_sequence integer;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can prepare applications.' using errcode = '42501'; end if;
  perform public.lock_active_booking_assistance_case(p_case_id, array['suggestions_ready','submitted']);
  if not exists (select 1 from public.booking_assistance_suggestions where case_id = p_case_id) then raise exception 'Add at least one reviewed suggestion first.' using errcode = '22023'; end if;
  if exists (select 1 from public.booking_assistance_applications where case_id = p_case_id and outcome = 'active') then raise exception 'Resolve the current application before preparing another.' using errcode = '22023'; end if;
  select count(*) + 1 into next_sequence from public.booking_assistance_applications where case_id = p_case_id;
  if next_sequence > 2 then raise exception 'This service includes up to two applications.' using errcode = '22023'; end if;
  insert into public.booking_assistance_applications(case_id, sequence, venue_name, official_url, application_text, requires_venue_payment, requires_permit, staff_checked_by)
  values (p_case_id, next_sequence, btrim(p_venue_name), p_official_url, btrim(p_application_text), p_requires_venue_payment, p_requires_permit, (select auth.uid())) returning * into result;
  update public.booking_assistance_cases set status = 'draft_ready' where id = p_case_id;
  return result;
end $$;

drop function public.approve_booking_assistance_application(uuid);

create function public.approve_booking_assistance_application(p_application_id uuid, p_expected_revision bigint)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; selected_case public.booking_assistance_cases%rowtype; selected_case_id uuid;
begin
  select case_id into selected_case_id from public.booking_assistance_applications where id = p_application_id;
  select * into selected_case from public.lock_active_booking_assistance_case(selected_case_id, array['draft_ready']);
  if selected_case.customer_id is distinct from (select auth.uid()) then raise exception 'This application cannot be approved.' using errcode = 'P0002'; end if;
  update public.booking_assistance_applications set customer_approved_at = now()
  where id = p_application_id and case_id = selected_case.id and revision = p_expected_revision
    and outcome = 'active' and customer_approved_at is null and submitted_at is null
  returning * into result;
  if not found then raise exception 'This application changed or cannot be approved. Reload and review the exact submission details.' using errcode = '40001'; end if;
  update public.booking_assistance_cases set status = 'customer_approved', customer_service_accepted_at = coalesce(customer_service_accepted_at, now()) where id = result.case_id;
  return result;
end $$;

create or replace function public.record_booking_assistance_submission(p_application_id uuid)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; selected_case_id uuid;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record submissions.' using errcode = '42501'; end if;
  select case_id into selected_case_id from public.booking_assistance_applications where id = p_application_id;
  perform public.lock_active_booking_assistance_case(selected_case_id, array['customer_approved']);
  update public.booking_assistance_applications set submitted_at = now()
  where id = p_application_id and case_id = selected_case_id and outcome = 'active'
    and customer_approved_at is not null and submitted_at is null returning * into result;
  if not found then raise exception 'Customer approval is required before submission.' using errcode = 'P0002'; end if;
  update public.booking_assistance_cases set status = 'submitted' where id = result.case_id;
  return result;
end $$;

create or replace function public.record_booking_assistance_followup(p_application_id uuid)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; selected_case_id uuid;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record follow-ups.' using errcode = '42501'; end if;
  select case_id into selected_case_id from public.booking_assistance_applications where id = p_application_id;
  perform public.lock_active_booking_assistance_case(selected_case_id, array['submitted']);
  update public.booking_assistance_applications set followup_count = followup_count + 1
  where id = p_application_id and case_id = selected_case_id and outcome = 'active'
    and submitted_at is not null and confirmed_at is null and followup_count < 2 returning * into result;
  if not found then raise exception 'No additional follow-up is available.' using errcode = '22023'; end if;
  return result;
end $$;

create or replace function public.confirm_booking_assistance_application(
  p_application_id uuid, p_written_approval_evidence text, p_venue_payment_record text, p_permit_record text
)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; selected_case_id uuid;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record venue confirmation.' using errcode = '42501'; end if;
  select case_id into selected_case_id from public.booking_assistance_applications where id = p_application_id;
  perform public.lock_active_booking_assistance_case(selected_case_id, array['submitted']);
  update public.booking_assistance_applications set written_approval_evidence = btrim(p_written_approval_evidence),
    venue_payment_record = nullif(btrim(p_venue_payment_record), ''), permit_record = nullif(btrim(p_permit_record), ''),
    venue_payment_recorded_at = case when char_length(btrim(p_venue_payment_record)) >= 3 then now() else null end,
    permit_recorded_at = case when char_length(btrim(p_permit_record)) >= 3 then now() else null end,
    confirmed_at = now(), outcome = 'confirmed', resolved_at = now()
  where id = p_application_id and case_id = selected_case_id and outcome = 'active'
    and submitted_at is not null and confirmed_at is null
    and char_length(btrim(p_written_approval_evidence)) >= 10
    and (not requires_venue_payment or char_length(btrim(p_venue_payment_record)) >= 3)
    and (not requires_permit or char_length(btrim(p_permit_record)) >= 3)
  returning * into result;
  if not found then raise exception 'Written approval and every required venue payment or permit record are required.' using errcode = '22023'; end if;
  update public.booking_assistance_cases set status = 'confirmed', confirmed_at = now() where id = result.case_id and status = 'submitted';
  if not found then raise exception 'This assistance case is no longer active for confirmation.' using errcode = 'P0002'; end if;
  update public.booking_assistance_fee_previews set preview_state = 'proposed_eligible',
    reason = 'Preview only: customer accepted the service and venue conditions were recorded as met.', evaluated_at = now()
  where case_id = result.case_id and exists (
    select 1 from public.booking_assistance_cases where id = result.case_id and customer_service_accepted_at is not null and status = 'confirmed'
  );
  return result;
end $$;

create function public.record_booking_assistance_application_unsuccessful(p_application_id uuid, p_reason text)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype; selected_case_id uuid;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can resolve applications.' using errcode = '42501'; end if;
  select case_id into selected_case_id from public.booking_assistance_applications where id = p_application_id;
  perform public.lock_active_booking_assistance_case(selected_case_id, array['submitted']);
  update public.booking_assistance_applications
  set outcome = 'unsuccessful', resolved_at = now(), resolution_reason = btrim(p_reason)
  where id = p_application_id and case_id = selected_case_id and outcome = 'active'
    and submitted_at is not null and confirmed_at is null and char_length(btrim(p_reason)) >= 3
  returning * into result;
  if not found then raise exception 'Record why the active submitted application was unsuccessful.' using errcode = '22023'; end if;
  update public.booking_assistance_cases set status = 'suggestions_ready' where id = selected_case_id and status = 'submitted';
  if not found then raise exception 'This assistance case is no longer active.' using errcode = 'P0002'; end if;
  return result;
end $$;

create or replace function public.close_booking_assistance_case(p_case_id uuid, p_reason text)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  select * into result from public.booking_assistance_cases
  where id = p_case_id and customer_id = (select auth.uid()) for update;
  if not found or result.status in ('closed','expired','confirmed') or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'This assistance case cannot be closed.' using errcode = 'P0002';
  end if;
  update public.booking_assistance_cases set status = 'closed', closed_reason = btrim(p_reason)
  where id = p_case_id returning * into result;
  update public.booking_assistance_fee_previews set preview_state = case when result.confirmed_at is null then 'no_fee' else 'proposed_eligible' end,
    reason = case when result.confirmed_at is null then 'Customer closed the case before confirmation.' else 'Preview only: customer closed the case after recorded confirmation.' end,
    evaluated_at = now() where case_id = p_case_id;
  return result;
end $$;

create or replace function public.record_booking_assistance_reversal(p_case_id uuid, p_reason text)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record a reversal.' using errcode = '42501'; end if;
  select * into result from public.booking_assistance_cases where id = p_case_id for update;
  if not found or result.status <> 'confirmed' or result.confirmed_at is null or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Only a confirmed case can record this outcome.' using errcode = 'P0002';
  end if;
  update public.booking_assistance_cases set status = 'closed', closed_reason = btrim(p_reason) where id = p_case_id returning * into result;
  update public.booking_assistance_fee_previews set preview_state = 'proposed_refund_or_waiver', reason = btrim(p_reason), evaluated_at = now() where case_id = p_case_id;
  return result;
end $$;

create or replace function public.expire_booking_assistance_case(p_case_id uuid)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can expire assistance cases.' using errcode = '42501'; end if;
  select * into result from public.booking_assistance_cases where id = p_case_id for update;
  if not found or result.confirmed_at is not null or result.service_deadline >= current_date or result.status in ('closed','expired','confirmed') then
    raise exception 'This assistance case is not eligible to expire.' using errcode = 'P0002';
  end if;
  update public.booking_assistance_cases set status = 'expired', closed_reason = 'Service period ended without confirmation.' where id = p_case_id returning * into result;
  update public.booking_assistance_fee_previews set preview_state = 'no_fee', reason = 'Service period ended without confirmation.', evaluated_at = now() where case_id = p_case_id;
  return result;
end $$;

revoke all on function public.add_booking_assistance_suggestion(uuid, text, text, text) from public, anon;
revoke all on function public.prepare_booking_assistance_application(uuid, text, text, text, boolean, boolean) from public, anon;
revoke all on function public.approve_booking_assistance_application(uuid, bigint) from public, anon;
revoke all on function public.record_booking_assistance_submission(uuid) from public, anon;
revoke all on function public.record_booking_assistance_followup(uuid) from public, anon;
revoke all on function public.confirm_booking_assistance_application(uuid, text, text, text) from public, anon;
revoke all on function public.record_booking_assistance_application_unsuccessful(uuid, text) from public, anon;
revoke all on function public.close_booking_assistance_case(uuid, text) from public, anon;
revoke all on function public.record_booking_assistance_reversal(uuid, text) from public, anon;
revoke all on function public.expire_booking_assistance_case(uuid) from public, anon;
grant execute on function public.approve_booking_assistance_application(uuid, bigint) to authenticated;
grant execute on function public.record_booking_assistance_application_unsuccessful(uuid, text) to authenticated;
