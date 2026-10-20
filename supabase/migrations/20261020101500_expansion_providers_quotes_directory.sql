-- Expansion foundation: service and rental providers, the shared quote pipeline,
-- and the curated community-space directory.
--
-- Providers and their offerings are reviewed by Yardly staff before they appear
-- publicly. Quotes are settled between the planner and the provider directly;
-- Yardly keeps the request and the reply together and tracks where it stands.

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;

revoke all on table public.staff from anon, authenticated;
grant select on table public.staff to authenticated;

drop policy if exists "staff_read_own" on public.staff;
create policy "staff_read_own"
on public.staff for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Providers -----------------------------------------------------------------

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('service', 'rental')),
  category text not null check (
    category in (
      'Photography',
      'Videography',
      'Catering',
      'Music & DJ',
      'Event staffing',
      'Decor & florals',
      'Event equipment'
    )
  ),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  tagline text not null default '' check (char_length(tagline) <= 160),
  description text not null default '' check (char_length(description) <= 4000),
  service_area text not null check (char_length(btrim(service_area)) between 2 and 160),
  contact_email text check (contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{7,15}$'),
  starting_price numeric(10, 2) not null check (starting_price >= 0),
  price_unit text not null default 'event' check (price_unit in ('hour', 'event', 'day', 'item')),
  images text[] not null default '{}',
  status text not null default 'draft' check (
    status in ('draft', 'pending_review', 'published', 'rejected', 'paused')
  ),
  review_notes text not null default '' check (char_length(review_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_rental_category check (
    kind <> 'rental' or category = 'Event equipment'
  ),
  constraint providers_published_complete check (
    status <> 'published'
    or (
      cardinality(images) > 0
      and char_length(btrim(description)) >= 20
      and (contact_email is not null or contact_phone is not null)
    )
  )
);

create index if not exists providers_published_category_idx
  on public.providers (category, created_at desc)
  where status = 'published';
create index if not exists providers_owner_idx
  on public.providers (owner_id, created_at desc);
create index if not exists providers_review_queue_idx
  on public.providers (created_at)
  where status = 'pending_review';

drop trigger if exists providers_set_updated_at on public.providers;
create trigger providers_set_updated_at before update on public.providers
for each row execute function public.set_updated_at();

alter table public.providers enable row level security;

revoke all on table public.providers from anon, authenticated;
grant select on table public.providers to anon, authenticated;
grant insert, update, delete on table public.providers to authenticated;

drop policy if exists "providers_anon_read_published" on public.providers;
create policy "providers_anon_read_published"
on public.providers for select
to anon
using (status = 'published');

drop policy if exists "providers_authenticated_read" on public.providers;
create policy "providers_authenticated_read"
on public.providers for select
to authenticated
using (
  status = 'published'
  or (select auth.uid()) = owner_id
  or public.is_staff()
);

drop policy if exists "providers_owner_insert" on public.providers;
create policy "providers_owner_insert"
on public.providers for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and status in ('draft', 'pending_review')
  and btrim(review_notes) = ''
);

-- Owners may edit their own profile but never publish it themselves; staff
-- move a profile to published, rejected or paused after review.
drop policy if exists "providers_owner_update" on public.providers;
create policy "providers_owner_update"
on public.providers for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and status in ('draft', 'pending_review', 'paused')
);

drop policy if exists "providers_staff_update" on public.providers;
create policy "providers_staff_update"
on public.providers for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "providers_owner_delete" on public.providers;
create policy "providers_owner_delete"
on public.providers for delete
to authenticated
using ((select auth.uid()) = owner_id and status <> 'published');

-- Service offerings ---------------------------------------------------------

create table if not exists public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  starting_price numeric(10, 2) not null check (starting_price >= 0),
  price_unit text not null default 'event' check (price_unit in ('hour', 'event', 'day')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_services_provider_idx
  on public.provider_services (provider_id, sort_order, created_at);

drop trigger if exists provider_services_set_updated_at on public.provider_services;
create trigger provider_services_set_updated_at before update on public.provider_services
for each row execute function public.set_updated_at();

alter table public.provider_services enable row level security;

revoke all on table public.provider_services from anon, authenticated;
grant select on table public.provider_services to anon, authenticated;
grant insert, update, delete on table public.provider_services to authenticated;

drop policy if exists "provider_services_anon_read_published" on public.provider_services;
create policy "provider_services_anon_read_published"
on public.provider_services for select
to anon
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.status = 'published'
  )
);

drop policy if exists "provider_services_authenticated_read" on public.provider_services;
create policy "provider_services_authenticated_read"
on public.provider_services for select
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id
      and (
        providers.status = 'published'
        or providers.owner_id = (select auth.uid())
      )
  )
  or public.is_staff()
);

drop policy if exists "provider_services_owner_write" on public.provider_services;
create policy "provider_services_owner_write"
on public.provider_services for insert
to authenticated
with check (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

drop policy if exists "provider_services_owner_update" on public.provider_services;
create policy "provider_services_owner_update"
on public.provider_services for update
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

drop policy if exists "provider_services_owner_delete" on public.provider_services;
create policy "provider_services_owner_delete"
on public.provider_services for delete
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

-- Rental inventory ----------------------------------------------------------

create table if not exists public.rental_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  available_quantity integer not null check (available_quantity between 0 and 100000),
  min_quantity integer not null default 1 check (min_quantity >= 1),
  offers_delivery boolean not null default false,
  offers_setup boolean not null default false,
  offers_pickup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_items_min_within_available check (min_quantity <= available_quantity)
);

create index if not exists rental_items_provider_idx
  on public.rental_items (provider_id, name);

drop trigger if exists rental_items_set_updated_at on public.rental_items;
create trigger rental_items_set_updated_at before update on public.rental_items
for each row execute function public.set_updated_at();

alter table public.rental_items enable row level security;

revoke all on table public.rental_items from anon, authenticated;
grant select on table public.rental_items to anon, authenticated;
grant insert, update, delete on table public.rental_items to authenticated;

drop policy if exists "rental_items_anon_read_published" on public.rental_items;
create policy "rental_items_anon_read_published"
on public.rental_items for select
to anon
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.status = 'published'
  )
);

drop policy if exists "rental_items_authenticated_read" on public.rental_items;
create policy "rental_items_authenticated_read"
on public.rental_items for select
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id
      and (
        providers.status = 'published'
        or providers.owner_id = (select auth.uid())
      )
  )
  or public.is_staff()
);

drop policy if exists "rental_items_owner_insert" on public.rental_items;
create policy "rental_items_owner_insert"
on public.rental_items for insert
to authenticated
with check (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

drop policy if exists "rental_items_owner_update" on public.rental_items;
create policy "rental_items_owner_update"
on public.rental_items for update
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

drop policy if exists "rental_items_owner_delete" on public.rental_items;
create policy "rental_items_owner_delete"
on public.rental_items for delete
to authenticated
using (
  exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
);

-- Quote pipeline ------------------------------------------------------------
-- A request alone reserves nothing. The provider quotes, the planner accepts
-- and pays the provider directly, and the provider confirms.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  requester_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  event_date date not null,
  event_location text not null check (char_length(btrim(event_location)) between 2 and 160),
  start_time time,
  hours numeric(4, 1) check (hours is null or hours between 0.5 and 24),
  guest_count integer not null check (guest_count between 1 and 10000),
  notes text not null default '' check (char_length(notes) <= 2000),
  needs_delivery boolean not null default false,
  needs_setup boolean not null default false,
  needs_pickup boolean not null default false,
  status text not null default 'awaiting_reply' check (
    status in ('awaiting_reply', 'quoted', 'accepted', 'confirmed', 'declined', 'closed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_requests_requester_idx
  on public.quote_requests (requester_id, created_at desc);
create index if not exists quote_requests_provider_idx
  on public.quote_requests (provider_id, created_at desc);
create index if not exists quote_requests_open_idx
  on public.quote_requests (provider_id, created_at)
  where status in ('awaiting_reply', 'quoted', 'accepted');

drop trigger if exists quote_requests_set_updated_at on public.quote_requests;
create trigger quote_requests_set_updated_at before update on public.quote_requests
for each row execute function public.set_updated_at();

alter table public.quote_requests enable row level security;

revoke all on table public.quote_requests from anon, authenticated;
grant select, insert on table public.quote_requests to authenticated;

drop policy if exists "quote_requests_parties_read" on public.quote_requests;
create policy "quote_requests_parties_read"
on public.quote_requests for select
to authenticated
using (
  (select auth.uid()) = requester_id
  or exists (
    select 1 from public.providers
    where providers.id = provider_id and providers.owner_id = (select auth.uid())
  )
  or public.is_staff()
);

drop policy if exists "quote_requests_requester_insert" on public.quote_requests;
create policy "quote_requests_requester_insert"
on public.quote_requests for insert
to authenticated
with check (
  (select auth.uid()) = requester_id
  and status = 'awaiting_reply'
  and event_date >= current_date
  and exists (
    select 1 from public.providers
    where providers.id = provider_id
      and providers.status = 'published'
      and providers.owner_id <> (select auth.uid())
  )
);

create table if not exists public.quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  rental_item_id uuid not null references public.rental_items(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100000),
  created_at timestamptz not null default now(),
  constraint quote_request_items_unique unique (quote_request_id, rental_item_id)
);

create index if not exists quote_request_items_request_idx
  on public.quote_request_items (quote_request_id);

alter table public.quote_request_items enable row level security;

revoke all on table public.quote_request_items from anon, authenticated;
grant select, insert on table public.quote_request_items to authenticated;

drop policy if exists "quote_request_items_parties_read" on public.quote_request_items;
create policy "quote_request_items_parties_read"
on public.quote_request_items for select
to authenticated
using (
  exists (
    select 1 from public.quote_requests request
    where request.id = quote_request_id
      and (
        request.requester_id = (select auth.uid())
        or exists (
          select 1 from public.providers
          where providers.id = request.provider_id
            and providers.owner_id = (select auth.uid())
        )
      )
  )
  or public.is_staff()
);

drop policy if exists "quote_request_items_requester_insert" on public.quote_request_items;
create policy "quote_request_items_requester_insert"
on public.quote_request_items for insert
to authenticated
with check (
  exists (
    select 1 from public.quote_requests request
    where request.id = quote_request_id
      and request.requester_id = (select auth.uid())
      and request.status = 'awaiting_reply'
  )
  and exists (
    select 1 from public.rental_items item
    join public.quote_requests request on request.id = quote_request_id
    where item.id = rental_item_id
      and item.provider_id = request.provider_id
      and quantity between item.min_quantity and item.available_quantity
  )
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete restrict,
  total_price numeric(10, 2) not null check (total_price >= 0),
  deposit numeric(10, 2) not null default 0 check (deposit >= 0),
  includes text not null default '' check (char_length(includes) <= 2000),
  cancellation_terms text not null check (char_length(btrim(cancellation_terms)) between 10 and 2000),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quotes_deposit_within_total check (deposit <= total_price),
  constraint quotes_one_per_request unique (quote_request_id)
);

create index if not exists quotes_provider_idx
  on public.quotes (provider_id, created_at desc);

alter table public.quotes enable row level security;

revoke all on table public.quotes from anon, authenticated;
grant select on table public.quotes to authenticated;

drop policy if exists "quotes_parties_read" on public.quotes;
create policy "quotes_parties_read"
on public.quotes for select
to authenticated
using (
  exists (
    select 1 from public.quote_requests request
    where request.id = quote_request_id
      and (
        request.requester_id = (select auth.uid())
        or exists (
          select 1 from public.providers
          where providers.id = request.provider_id
            and providers.owner_id = (select auth.uid())
        )
      )
  )
  or public.is_staff()
);

-- Submitting a quote and advancing the pipeline both move more than one row,
-- so they go through functions rather than table policies.

create or replace function public.submit_quote(
  p_quote_request_id uuid,
  p_total_price numeric,
  p_deposit numeric,
  p_includes text,
  p_cancellation_terms text,
  p_expires_at timestamptz default null
)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_request public.quote_requests%rowtype;
  created_quote public.quotes%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before sending a quote.' using errcode = '42501';
  end if;

  select request.* into selected_request
  from public.quote_requests request
  join public.providers provider on provider.id = request.provider_id
  where request.id = p_quote_request_id
    and provider.owner_id = caller_id
    and request.status = 'awaiting_reply';

  if not found then
    raise exception 'This request is not waiting for a quote.' using errcode = 'P0002';
  end if;

  insert into public.quotes (
    quote_request_id,
    provider_id,
    total_price,
    deposit,
    includes,
    cancellation_terms,
    expires_at
  ) values (
    selected_request.id,
    selected_request.provider_id,
    round(p_total_price, 2),
    round(coalesce(p_deposit, 0), 2),
    coalesce(p_includes, ''),
    p_cancellation_terms,
    p_expires_at
  ) returning * into created_quote;

  update public.quote_requests
  set status = 'quoted'
  where id = selected_request.id;

  return created_quote;
end;
$$;

revoke all on function public.submit_quote(uuid, numeric, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.submit_quote(uuid, numeric, numeric, text, text, timestamptz) to authenticated;

create or replace function public.set_quote_request_status(
  p_quote_request_id uuid,
  p_status text
)
returns public.quote_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_request public.quote_requests%rowtype;
  is_requester boolean;
  is_provider boolean;
  updated_request public.quote_requests%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before updating a request.' using errcode = '42501';
  end if;

  select request.* into selected_request
  from public.quote_requests request
  where request.id = p_quote_request_id;

  if not found then
    raise exception 'This request no longer exists.' using errcode = 'P0002';
  end if;

  is_requester := selected_request.requester_id = caller_id;
  is_provider := exists (
    select 1 from public.providers
    where providers.id = selected_request.provider_id
      and providers.owner_id = caller_id
  );

  if not (is_requester or is_provider) then
    raise exception 'You cannot update this request.' using errcode = '42501';
  end if;

  -- The planner accepts a quote; the provider declines or confirms it.
  -- Either side may close a request that has not been confirmed.
  if p_status = 'accepted' then
    if not is_requester or selected_request.status <> 'quoted' then
      raise exception 'Only the planner can accept an open quote.' using errcode = '22023';
    end if;
  elsif p_status = 'confirmed' then
    if not is_provider or selected_request.status <> 'accepted' then
      raise exception 'A provider confirms only after the planner accepts and pays.' using errcode = '22023';
    end if;
  elsif p_status = 'declined' then
    if not is_provider or selected_request.status not in ('awaiting_reply', 'quoted', 'accepted') then
      raise exception 'Only the provider can decline an open request.' using errcode = '22023';
    end if;
  elsif p_status = 'closed' then
    if selected_request.status = 'confirmed' then
      raise exception 'A confirmed booking cannot be closed here.' using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported request status.' using errcode = '22023';
  end if;

  update public.quote_requests
  set status = p_status
  where id = selected_request.id
  returning * into updated_request;

  return updated_request;
end;
$$;

revoke all on function public.set_quote_request_status(uuid, text) from public, anon;
grant execute on function public.set_quote_request_status(uuid, text) to authenticated;

-- Community-space directory -------------------------------------------------
-- Curated by Yardly staff. Entries point at the venue's own reservation
-- process and record when the details were last checked.

create table if not exists public.directory_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  category text not null check (
    category in (
      'Parks',
      'Gyms',
      'Recreation centers',
      'Community halls',
      'Libraries',
      'Church spaces'
    )
  ),
  location text not null check (char_length(btrim(location)) between 2 and 160),
  latitude double precision,
  longitude double precision,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  amenities text[] not null default '{}',
  pricing_note text not null default '' check (char_length(pricing_note) <= 500),
  restrictions text not null default '' check (char_length(restrictions) <= 2000),
  official_url text not null check (official_url ~ '^https?://'),
  booking_contact text not null default '' check (char_length(booking_contact) <= 200),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint directory_spaces_coordinates_range check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

create index if not exists directory_spaces_category_idx
  on public.directory_spaces (category, name);
create index if not exists directory_spaces_last_checked_idx
  on public.directory_spaces (last_checked_at);

drop trigger if exists directory_spaces_set_updated_at on public.directory_spaces;
create trigger directory_spaces_set_updated_at before update on public.directory_spaces
for each row execute function public.set_updated_at();

alter table public.directory_spaces enable row level security;

revoke all on table public.directory_spaces from anon, authenticated;
grant select on table public.directory_spaces to anon, authenticated;
grant insert, update, delete on table public.directory_spaces to authenticated;

drop policy if exists "directory_spaces_public_read" on public.directory_spaces;
create policy "directory_spaces_public_read"
on public.directory_spaces for select
to anon, authenticated
using (true);

drop policy if exists "directory_spaces_staff_insert" on public.directory_spaces;
create policy "directory_spaces_staff_insert"
on public.directory_spaces for insert
to authenticated
with check (public.is_staff());

drop policy if exists "directory_spaces_staff_update" on public.directory_spaces;
create policy "directory_spaces_staff_update"
on public.directory_spaces for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "directory_spaces_staff_delete" on public.directory_spaces;
create policy "directory_spaces_staff_delete"
on public.directory_spaces for delete
to authenticated
using (public.is_staff());
