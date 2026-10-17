create table public.provider_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  event_location text not null check (char_length(btrim(event_location)) between 3 and 240),
  guest_count integer not null check (guest_count between 1 and 100000),
  needs text not null check (char_length(btrim(needs)) between 10 and 4000),
  status text not null default 'waiting_for_reply' check (status in ('waiting_for_reply', 'quoted', 'confirmed', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_requests_valid_hours check (end_time > start_time)
);

create table public.provider_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.provider_requests(id) on delete cascade,
  item_name text not null check (char_length(btrim(item_name)) between 2 and 120),
  quantity integer not null check (quantity between 1 and 100000),
  options text not null default '' check (char_length(options) <= 1000),
  created_at timestamptz not null default now()
);

create table public.provider_quotes (
  request_id uuid primary key references public.provider_requests(id) on delete cascade,
  full_price numeric(10, 2) not null check (full_price >= 0),
  deposit_amount numeric(10, 2) not null check (deposit_amount >= 0 and deposit_amount <= full_price),
  cancellation_terms text not null check (char_length(btrim(cancellation_terms)) between 10 and 2000),
  inclusions text not null check (char_length(btrim(inclusions)) between 10 and 3000),
  quoted_at timestamptz not null default now(),
  accepted_at timestamptz,
  direct_payment_acknowledged_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint provider_quotes_acceptance_payment_together check (
    (accepted_at is null and direct_payment_acknowledged_at is null)
    or (accepted_at is not null and direct_payment_acknowledged_at is not null)
  ),
  constraint provider_quotes_confirmation_requires_acceptance check (
    confirmed_at is null or (accepted_at is not null and direct_payment_acknowledged_at is not null)
  )
);

create table public.provider_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.provider_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index provider_requests_customer_updated_idx on public.provider_requests (customer_id, updated_at desc);
create index provider_requests_provider_updated_idx on public.provider_requests (provider_id, updated_at desc);
create index provider_request_items_request_idx on public.provider_request_items (request_id);
create index provider_request_messages_request_created_idx on public.provider_request_messages (request_id, created_at);
create index provider_request_messages_sender_idx on public.provider_request_messages (sender_id);

drop trigger if exists provider_requests_set_updated_at on public.provider_requests;
create trigger provider_requests_set_updated_at before update on public.provider_requests
for each row execute function public.set_updated_at();
drop trigger if exists provider_quotes_set_updated_at on public.provider_quotes;
create trigger provider_quotes_set_updated_at before update on public.provider_quotes
for each row execute function public.set_updated_at();

alter table public.provider_requests enable row level security;
alter table public.provider_request_items enable row level security;
alter table public.provider_quotes enable row level security;
alter table public.provider_request_messages enable row level security;

revoke all on table public.provider_requests, public.provider_request_items, public.provider_quotes, public.provider_request_messages from anon, authenticated;
grant select on table public.provider_requests, public.provider_request_items, public.provider_quotes, public.provider_request_messages to authenticated;

create policy "provider_requests_participants_or_staff_select"
on public.provider_requests for select to authenticated
using (
  customer_id = (select auth.uid())
  or exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_requests.provider_id
      and provider_profiles.owner_id = (select auth.uid())
  )
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "provider_request_items_participants_or_staff_select"
on public.provider_request_items for select to authenticated
using (exists (select 1 from public.provider_requests where provider_requests.id = provider_request_items.request_id));

create policy "provider_quotes_participants_or_staff_select"
on public.provider_quotes for select to authenticated
using (exists (select 1 from public.provider_requests where provider_requests.id = provider_quotes.request_id));

create policy "provider_request_messages_participants_or_staff_select"
on public.provider_request_messages for select to authenticated
using (exists (select 1 from public.provider_requests where provider_requests.id = provider_request_messages.request_id));

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
  created_request public.provider_requests%rowtype;
  item jsonb;
begin
  if caller_id is null then raise exception 'Sign in before requesting a quote.' using errcode = '42501'; end if;
  select * into selected_provider from public.provider_profiles where id = p_provider_id and review_state = 'approved';
  if not found then raise exception 'This provider is not available for requests.' using errcode = 'P0002'; end if;
  if selected_provider.owner_id = caller_id then raise exception 'Providers cannot request their own services.' using errcode = '22023'; end if;
  if p_event_date < current_date then raise exception 'Choose a future event date.' using errcode = '22023'; end if;
  if p_end_time <= p_start_time then raise exception 'The end time must be after the start time.' using errcode = '22023'; end if;
  if p_guest_count < 1 or p_guest_count > 100000 then raise exception 'Enter a valid guest count.' using errcode = '22023'; end if;
  if char_length(btrim(p_event_location)) < 3 or char_length(btrim(p_needs)) < 10 then raise exception 'Complete the event location and needs.' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Equipment items must be an array.' using errcode = '22023'; end if;
  if selected_provider.kind = 'equipment' and jsonb_array_length(p_items) < 1 then raise exception 'Add at least one equipment item and quantity.' using errcode = '22023'; end if;

  insert into public.provider_requests(provider_id, customer_id, event_date, start_time, end_time, event_location, guest_count, needs)
  values (p_provider_id, caller_id, p_event_date, p_start_time, p_end_time, btrim(p_event_location), p_guest_count, btrim(p_needs))
  returning * into created_request;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or char_length(btrim(coalesce(item->>'name', ''))) < 2
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$'
      or (item->>'quantity')::integer > 100000 then
      raise exception 'Each equipment item needs a name and valid quantity.' using errcode = '22023';
    end if;
    insert into public.provider_request_items(request_id, item_name, quantity, options)
    values (created_request.id, btrim(item->>'name'), (item->>'quantity')::integer, left(btrim(coalesce(item->>'options', '')), 1000));
  end loop;
  return created_request;
end;
$$;

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
  if exists (select 1 from public.provider_quotes where request_id = p_request_id and accepted_at is not null) then raise exception 'An accepted quote cannot be changed.' using errcode = '22023'; end if;
  if p_full_price < 0 or p_deposit_amount < 0 or p_deposit_amount > p_full_price then raise exception 'Enter valid quote and deposit amounts.' using errcode = '22023'; end if;
  if char_length(btrim(p_cancellation_terms)) < 10 or char_length(btrim(p_inclusions)) < 10 then raise exception 'Include cancellation terms and what the quote includes.' using errcode = '22023'; end if;
  insert into public.provider_quotes(request_id, full_price, deposit_amount, cancellation_terms, inclusions)
  values (p_request_id, p_full_price, p_deposit_amount, btrim(p_cancellation_terms), btrim(p_inclusions))
  on conflict (request_id) do update set full_price = excluded.full_price, deposit_amount = excluded.deposit_amount,
    cancellation_terms = excluded.cancellation_terms, inclusions = excluded.inclusions, quoted_at = now();
  update public.provider_requests set status = 'quoted' where id = p_request_id returning * into selected_request;
  return selected_request;
end;
$$;

create or replace function public.accept_provider_quote(p_request_id uuid, p_direct_payment_acknowledged boolean)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  if p_direct_payment_acknowledged is not true then raise exception 'Confirm payment is handled directly with the provider.' using errcode = '22023'; end if;
  select * into selected_request from public.provider_requests
  where id = p_request_id and customer_id = (select auth.uid()) and status = 'quoted' for update;
  if not found then raise exception 'This quote cannot be accepted.' using errcode = 'P0002'; end if;
  update public.provider_quotes set accepted_at = now(), direct_payment_acknowledged_at = now()
  where request_id = p_request_id and accepted_at is null;
  if not found then raise exception 'This quote is no longer available.' using errcode = 'P0002'; end if;
  return selected_request;
end;
$$;

create or replace function public.confirm_provider_request(p_request_id uuid)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  update public.provider_requests request set status = 'confirmed'
  from public.provider_profiles provider, public.provider_quotes quote
  where request.id = p_request_id and provider.id = request.provider_id
    and provider.owner_id = (select auth.uid()) and quote.request_id = request.id
    and request.status = 'quoted' and quote.accepted_at is not null and quote.direct_payment_acknowledged_at is not null
  returning request.* into selected_request;
  if not found then raise exception 'Customer acceptance and direct-provider payment acknowledgment are required before confirmation.' using errcode = 'P0002'; end if;
  update public.provider_quotes set confirmed_at = now() where request_id = p_request_id;
  return selected_request;
end;
$$;

create or replace function public.decline_provider_request(p_request_id uuid)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  update public.provider_requests request set status = 'declined'
  from public.provider_profiles provider
  where request.id = p_request_id and provider.id = request.provider_id
    and provider.owner_id = (select auth.uid()) and request.status in ('waiting_for_reply', 'quoted')
  returning request.* into selected_request;
  if not found then raise exception 'This request cannot be declined.' using errcode = 'P0002'; end if;
  return selected_request;
end;
$$;

create or replace function public.close_provider_request(p_request_id uuid)
returns public.provider_requests
language plpgsql
security definer
set search_path = ''
as $$
declare selected_request public.provider_requests%rowtype;
begin
  update public.provider_requests request set status = 'closed'
  where request.id = p_request_id and request.status <> 'closed' and (
    request.customer_id = (select auth.uid()) or exists (
      select 1 from public.provider_profiles where provider_profiles.id = request.provider_id and provider_profiles.owner_id = (select auth.uid())
    )
  ) returning request.* into selected_request;
  if not found then raise exception 'This request cannot be closed.' using errcode = 'P0002'; end if;
  return selected_request;
end;
$$;

create or replace function public.send_provider_request_message(p_request_id uuid, p_body text)
returns public.provider_request_messages
language plpgsql
security definer
set search_path = ''
as $$
declare created_message public.provider_request_messages%rowtype;
begin
  if char_length(btrim(p_body)) < 1 or char_length(btrim(p_body)) > 2000 then raise exception 'Enter a message up to 2,000 characters.' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.provider_requests request
    where request.id = p_request_id and (
      request.customer_id = (select auth.uid()) or exists (
        select 1 from public.provider_profiles where provider_profiles.id = request.provider_id and provider_profiles.owner_id = (select auth.uid())
      )
    )
  ) then raise exception 'This request is not available.' using errcode = '42501'; end if;
  insert into public.provider_request_messages(request_id, sender_id, body)
  values (p_request_id, (select auth.uid()), btrim(p_body)) returning * into created_message;
  update public.provider_requests set updated_at = created_message.created_at where id = p_request_id;
  return created_message;
end;
$$;

revoke all on function public.create_provider_request(uuid, date, time, time, text, integer, text, jsonb) from public, anon;
revoke all on function public.quote_provider_request(uuid, numeric, numeric, text, text) from public, anon;
revoke all on function public.accept_provider_quote(uuid, boolean) from public, anon;
revoke all on function public.confirm_provider_request(uuid) from public, anon;
revoke all on function public.decline_provider_request(uuid) from public, anon;
revoke all on function public.close_provider_request(uuid) from public, anon;
revoke all on function public.send_provider_request_message(uuid, text) from public, anon;
grant execute on function public.create_provider_request(uuid, date, time, time, text, integer, text, jsonb) to authenticated;
grant execute on function public.quote_provider_request(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.accept_provider_quote(uuid, boolean) to authenticated;
grant execute on function public.confirm_provider_request(uuid) to authenticated;
grant execute on function public.decline_provider_request(uuid) to authenticated;
grant execute on function public.close_provider_request(uuid) to authenticated;
grant execute on function public.send_provider_request_message(uuid, text) to authenticated;
