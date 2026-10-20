create or replace function public.add_weekdays(p_start date, p_days integer)
returns date language plpgsql immutable set search_path = ''
as $$
declare result date := p_start; added integer := 0;
begin
  if p_days < 0 then raise exception 'Business-day count cannot be negative.' using errcode = '22023'; end if;
  while added < p_days loop
    result := result + 1;
    if extract(isodow from result) < 6 then added := added + 1; end if;
  end loop;
  return result;
end;
$$;

create table public.booking_assistance_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  location text not null check (char_length(btrim(location)) between 3 and 180),
  guest_count integer not null check (guest_count between 1 and 100000),
  event_type text not null check (char_length(btrim(event_type)) between 2 and 120),
  needs text not null check (char_length(btrim(needs)) between 20 and 4000),
  service_deadline date not null default public.add_weekdays(current_date, 10),
  status text not null default 'intake' check (status in ('intake','suggestions_ready','draft_ready','customer_approved','submitted','confirmed','closed','expired')),
  customer_service_accepted_at timestamptz,
  confirmed_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_assistance_suggestions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.booking_assistance_cases(id) on delete cascade,
  position integer not null check (position between 1 and 3),
  venue_name text not null check (char_length(btrim(venue_name)) between 2 and 160),
  official_url text not null check (official_url ~ '^https://[^[:space:]/]+'),
  rationale text not null check (char_length(btrim(rationale)) between 20 and 2000),
  prepared_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(case_id, position)
);

create table public.booking_assistance_applications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.booking_assistance_cases(id) on delete cascade,
  sequence integer not null check (sequence between 1 and 2),
  venue_name text not null check (char_length(btrim(venue_name)) between 2 and 160),
  official_url text not null check (official_url ~ '^https://[^[:space:]/]+'),
  application_text text not null check (char_length(btrim(application_text)) between 40 and 6000),
  requires_venue_payment boolean not null default false,
  requires_permit boolean not null default false,
  staff_checked_by uuid not null references auth.users(id) on delete restrict,
  staff_checked_at timestamptz not null default now(),
  customer_approved_at timestamptz,
  submitted_at timestamptz,
  followup_count integer not null default 0 check (followup_count between 0 and 2),
  written_approval_evidence text,
  venue_payment_record text,
  permit_record text,
  venue_payment_recorded_at timestamptz,
  permit_recorded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(case_id, sequence)
);

create table public.booking_assistance_fee_previews (
  case_id uuid primary key references public.booking_assistance_cases(id) on delete cascade,
  proposed_amount numeric(10,2) not null default 49 check (proposed_amount = 49),
  preview_state text not null default 'not_evaluated' check (preview_state in ('not_evaluated','proposed_eligible','no_fee','proposed_refund_or_waiver')),
  reason text not null default '',
  fee_charged boolean not null default false check (fee_charged = false),
  evaluated_at timestamptz not null default now()
);

create index booking_assistance_cases_customer_idx on public.booking_assistance_cases(customer_id, updated_at desc);
create index booking_assistance_cases_status_idx on public.booking_assistance_cases(status, updated_at desc);
create index booking_assistance_suggestions_case_idx on public.booking_assistance_suggestions(case_id, position);
create index booking_assistance_suggestions_prepared_by_idx on public.booking_assistance_suggestions(prepared_by);
create index booking_assistance_applications_case_idx on public.booking_assistance_applications(case_id, sequence);
create index booking_assistance_applications_staff_idx on public.booking_assistance_applications(staff_checked_by);

create trigger booking_assistance_cases_set_updated_at before update on public.booking_assistance_cases
for each row execute function public.set_updated_at();

alter table public.booking_assistance_cases enable row level security;
alter table public.booking_assistance_suggestions enable row level security;
alter table public.booking_assistance_applications enable row level security;
alter table public.booking_assistance_fee_previews enable row level security;
revoke all on table public.booking_assistance_cases, public.booking_assistance_suggestions, public.booking_assistance_applications, public.booking_assistance_fee_previews from anon, authenticated;
grant select on table public.booking_assistance_cases, public.booking_assistance_suggestions, public.booking_assistance_applications, public.booking_assistance_fee_previews to authenticated;

create policy "booking_assistance_cases_customer_or_staff_select" on public.booking_assistance_cases for select to authenticated
using (customer_id = (select auth.uid()) or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())));
create policy "booking_assistance_suggestions_customer_or_staff_select" on public.booking_assistance_suggestions for select to authenticated
using (exists (select 1 from public.booking_assistance_cases where id = booking_assistance_suggestions.case_id));
create policy "booking_assistance_applications_customer_or_staff_select" on public.booking_assistance_applications for select to authenticated
using (exists (select 1 from public.booking_assistance_cases where id = booking_assistance_applications.case_id));
create policy "booking_assistance_fee_previews_customer_or_staff_select" on public.booking_assistance_fee_previews for select to authenticated
using (exists (select 1 from public.booking_assistance_cases where id = booking_assistance_fee_previews.case_id));

create or replace function public.create_booking_assistance_case(p_event_date date, p_location text, p_guest_count integer, p_event_type text, p_needs text)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in before requesting booking help.' using errcode = '42501'; end if;
  if p_event_date < current_date or char_length(btrim(p_location)) < 3 or p_guest_count < 1
    or char_length(btrim(p_event_type)) < 2 or char_length(btrim(p_needs)) < 20 then
    raise exception 'Complete the event date, location, guest count, type, and needs.' using errcode = '22023';
  end if;
  insert into public.booking_assistance_cases(customer_id, event_date, location, guest_count, event_type, needs)
  values ((select auth.uid()), p_event_date, btrim(p_location), p_guest_count, btrim(p_event_type), btrim(p_needs)) returning * into result;
  insert into public.booking_assistance_fee_previews(case_id) values (result.id);
  return result;
end $$;

create or replace function public.add_booking_assistance_suggestion(p_case_id uuid, p_venue_name text, p_official_url text, p_rationale text)
returns public.booking_assistance_suggestions language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_suggestions%rowtype; next_position integer;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can prepare suggestions.' using errcode = '42501'; end if;
  select count(*) + 1 into next_position from public.booking_assistance_suggestions where case_id = p_case_id;
  if next_position > 3 or not exists (select 1 from public.booking_assistance_cases where id = p_case_id and status in ('intake','suggestions_ready')) then raise exception 'This case cannot accept another suggestion.' using errcode = '22023'; end if;
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
  if not exists (select 1 from public.booking_assistance_suggestions where case_id = p_case_id) then raise exception 'Add at least one reviewed suggestion first.' using errcode = '22023'; end if;
  if exists (select 1 from public.booking_assistance_applications where case_id = p_case_id and submitted_at is null) then raise exception 'Finish the current application before preparing another.' using errcode = '22023'; end if;
  select count(*) + 1 into next_sequence from public.booking_assistance_applications where case_id = p_case_id;
  if next_sequence > 2 then raise exception 'This service includes up to two applications.' using errcode = '22023'; end if;
  insert into public.booking_assistance_applications(case_id, sequence, venue_name, official_url, application_text, requires_venue_payment, requires_permit, staff_checked_by)
  values (p_case_id, next_sequence, btrim(p_venue_name), p_official_url, btrim(p_application_text), p_requires_venue_payment, p_requires_permit, (select auth.uid())) returning * into result;
  update public.booking_assistance_cases set status = 'draft_ready' where id = p_case_id;
  return result;
end $$;

create or replace function public.approve_booking_assistance_application(p_application_id uuid)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype;
begin
  update public.booking_assistance_applications application set customer_approved_at = now()
  from public.booking_assistance_cases assistance
  where application.id = p_application_id and assistance.id = application.case_id
    and assistance.customer_id = (select auth.uid()) and application.customer_approved_at is null and application.submitted_at is null
  returning application.* into result;
  if not found then raise exception 'This application cannot be approved.' using errcode = 'P0002'; end if;
  update public.booking_assistance_cases set status = 'customer_approved', customer_service_accepted_at = coalesce(customer_service_accepted_at, now()) where id = result.case_id;
  return result;
end $$;

create or replace function public.record_booking_assistance_submission(p_application_id uuid)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record submissions.' using errcode = '42501'; end if;
  update public.booking_assistance_applications set submitted_at = now()
  where id = p_application_id and customer_approved_at is not null and submitted_at is null returning * into result;
  if not found then raise exception 'Customer approval is required before submission.' using errcode = 'P0002'; end if;
  update public.booking_assistance_cases set status = 'submitted' where id = result.case_id;
  return result;
end $$;

create or replace function public.record_booking_assistance_followup(p_application_id uuid)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record follow-ups.' using errcode = '42501'; end if;
  update public.booking_assistance_applications set followup_count = followup_count + 1
  where id = p_application_id and submitted_at is not null and confirmed_at is null and followup_count < 2 returning * into result;
  if not found then raise exception 'No additional follow-up is available.' using errcode = '22023'; end if;
  return result;
end $$;

create or replace function public.confirm_booking_assistance_application(
  p_application_id uuid, p_written_approval_evidence text, p_venue_payment_record text, p_permit_record text
)
returns public.booking_assistance_applications language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_applications%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can record venue confirmation.' using errcode = '42501'; end if;
  update public.booking_assistance_applications set written_approval_evidence = btrim(p_written_approval_evidence),
    venue_payment_record = nullif(btrim(p_venue_payment_record), ''), permit_record = nullif(btrim(p_permit_record), ''),
    venue_payment_recorded_at = case when char_length(btrim(p_venue_payment_record)) >= 3 then now() else null end,
    permit_recorded_at = case when char_length(btrim(p_permit_record)) >= 3 then now() else null end, confirmed_at = now()
  where id = p_application_id and submitted_at is not null and confirmed_at is null
    and char_length(btrim(p_written_approval_evidence)) >= 10
    and (not requires_venue_payment or char_length(btrim(p_venue_payment_record)) >= 3)
    and (not requires_permit or char_length(btrim(p_permit_record)) >= 3)
  returning * into result;
  if not found then raise exception 'Written approval and every required venue payment or permit record are required.' using errcode = '22023'; end if;
  update public.booking_assistance_cases set status = 'confirmed', confirmed_at = now() where id = result.case_id;
  update public.booking_assistance_fee_previews preview set preview_state = 'proposed_eligible',
    reason = 'Preview only: customer accepted the service and venue conditions were recorded as met.', evaluated_at = now()
  from public.booking_assistance_cases assistance where preview.case_id = result.case_id and assistance.id = result.case_id and assistance.customer_service_accepted_at is not null;
  return result;
end $$;

create or replace function public.close_booking_assistance_case(p_case_id uuid, p_reason text)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  update public.booking_assistance_cases set status = 'closed', closed_reason = btrim(p_reason)
  where id = p_case_id and customer_id = (select auth.uid()) and status not in ('closed','expired') and char_length(btrim(p_reason)) >= 3 returning * into result;
  if not found then raise exception 'This assistance case cannot be closed.' using errcode = 'P0002'; end if;
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
  update public.booking_assistance_cases set status = 'closed', closed_reason = btrim(p_reason)
  where id = p_case_id and confirmed_at is not null and char_length(btrim(p_reason)) >= 3 returning * into result;
  if not found then raise exception 'Only a confirmed case can record this outcome.' using errcode = 'P0002'; end if;
  update public.booking_assistance_fee_previews set preview_state = 'proposed_refund_or_waiver', reason = btrim(p_reason), evaluated_at = now() where case_id = p_case_id;
  return result;
end $$;

create or replace function public.expire_booking_assistance_case(p_case_id uuid)
returns public.booking_assistance_cases language plpgsql security definer set search_path = ''
as $$ declare result public.booking_assistance_cases%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then raise exception 'Only assigned staff can expire assistance cases.' using errcode = '42501'; end if;
  update public.booking_assistance_cases set status = 'expired', closed_reason = 'Service period ended without confirmation.'
  where id = p_case_id and confirmed_at is null and service_deadline < current_date and status not in ('closed','expired') returning * into result;
  if not found then raise exception 'This assistance case is not eligible to expire.' using errcode = 'P0002'; end if;
  update public.booking_assistance_fee_previews set preview_state = 'no_fee', reason = 'Service period ended without confirmation.', evaluated_at = now() where case_id = p_case_id;
  return result;
end $$;

revoke all on function public.add_weekdays(date, integer) from public, anon, authenticated;
revoke all on function public.create_booking_assistance_case(date, text, integer, text, text) from public, anon;
revoke all on function public.add_booking_assistance_suggestion(uuid, text, text, text) from public, anon;
revoke all on function public.prepare_booking_assistance_application(uuid, text, text, text, boolean, boolean) from public, anon;
revoke all on function public.approve_booking_assistance_application(uuid) from public, anon;
revoke all on function public.record_booking_assistance_submission(uuid) from public, anon;
revoke all on function public.record_booking_assistance_followup(uuid) from public, anon;
revoke all on function public.confirm_booking_assistance_application(uuid, text, text, text) from public, anon;
revoke all on function public.close_booking_assistance_case(uuid, text) from public, anon;
revoke all on function public.record_booking_assistance_reversal(uuid, text) from public, anon;
revoke all on function public.expire_booking_assistance_case(uuid) from public, anon;
grant execute on function public.create_booking_assistance_case(date, text, integer, text, text) to authenticated;
grant execute on function public.add_booking_assistance_suggestion(uuid, text, text, text) to authenticated;
grant execute on function public.prepare_booking_assistance_application(uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.approve_booking_assistance_application(uuid) to authenticated;
grant execute on function public.record_booking_assistance_submission(uuid) to authenticated;
grant execute on function public.record_booking_assistance_followup(uuid) to authenticated;
grant execute on function public.confirm_booking_assistance_application(uuid, text, text, text) to authenticated;
grant execute on function public.close_booking_assistance_case(uuid, text) to authenticated;
grant execute on function public.record_booking_assistance_reversal(uuid, text) to authenticated;
grant execute on function public.expire_booking_assistance_case(uuid) to authenticated;
