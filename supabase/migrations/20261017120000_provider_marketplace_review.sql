create table if not exists public.marketplace_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  kind text not null check (kind in ('service', 'equipment')),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  category text not null check (char_length(btrim(category)) between 2 and 80),
  service_area text not null check (char_length(btrim(service_area)) between 2 and 180),
  summary text not null default '' check (char_length(summary) <= 2000),
  offerings text[] not null default '{}',
  starting_price numeric(10, 2) not null default 0 check (starting_price >= 0),
  sample_urls text[] not null default '{}',
  delivery_details text not null default '' check (char_length(delivery_details) <= 1000),
  setup_details text not null default '' check (char_length(setup_details) <= 1000),
  pickup_details text not null default '' check (char_length(pickup_details) <= 1000),
  review_state text not null default 'draft' check (review_state in ('draft', 'pending', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_inventory_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  quantity_available integer not null check (quantity_available > 0 and quantity_available <= 100000),
  created_at timestamptz not null default now(),
  constraint provider_inventory_item_unique unique (provider_id, name)
);

create table if not exists public.provider_profile_reviews (
  profile_id uuid primary key references public.provider_profiles(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create index if not exists provider_profiles_public_idx
  on public.provider_profiles (reviewed_at desc)
  where review_state = 'approved';
create index if not exists provider_profiles_review_queue_idx
  on public.provider_profiles (submitted_at)
  where review_state = 'pending';
create index if not exists provider_inventory_provider_idx
  on public.provider_inventory_items (provider_id);

drop trigger if exists provider_profiles_set_updated_at on public.provider_profiles;
create trigger provider_profiles_set_updated_at before update on public.provider_profiles
for each row execute function public.set_updated_at();

alter table public.marketplace_staff enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_inventory_items enable row level security;
alter table public.provider_profile_reviews enable row level security;

revoke all on table public.marketplace_staff, public.provider_profiles, public.provider_inventory_items, public.provider_profile_reviews from anon, authenticated;
grant select on table public.provider_profiles, public.provider_inventory_items to anon, authenticated;
grant select on table public.marketplace_staff to anon, authenticated;
grant insert (owner_id, kind, business_name, category, service_area, summary, offerings, starting_price, sample_urls, delivery_details, setup_details, pickup_details)
  on public.provider_profiles to authenticated;
grant update (kind, business_name, category, service_area, summary, offerings, starting_price, sample_urls, delivery_details, setup_details, pickup_details)
  on public.provider_profiles to authenticated;
grant insert (provider_id, name, quantity_available) on public.provider_inventory_items to authenticated;
grant update (name, quantity_available) on public.provider_inventory_items to authenticated;
grant delete on public.provider_inventory_items to authenticated;
grant select on public.provider_profile_reviews to authenticated;

create policy "marketplace_staff_self_select"
on public.marketplace_staff for select to authenticated
using (user_id = (select auth.uid()));

create policy "provider_profiles_visible_to_public_owner_or_staff"
on public.provider_profiles for select to anon, authenticated
using (
  review_state = 'approved'
  or owner_id = (select auth.uid())
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "provider_profiles_owner_insert_draft"
on public.provider_profiles for insert to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()) and review_state = 'draft');

create policy "provider_profiles_owner_update_editable"
on public.provider_profiles for update to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()) and review_state in ('draft', 'rejected'))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()) and review_state in ('draft', 'rejected'));

create policy "provider_inventory_visible_with_profile"
on public.provider_inventory_items for select to anon, authenticated
using (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_inventory_items.provider_id
  )
);

create policy "provider_inventory_owner_insert_editable"
on public.provider_inventory_items for insert to authenticated
with check (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_inventory_items.provider_id
      and provider_profiles.owner_id = (select auth.uid())
      and provider_profiles.review_state in ('draft', 'rejected')
  )
);

create policy "provider_inventory_owner_update_editable"
on public.provider_inventory_items for update to authenticated
using (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_inventory_items.provider_id
      and provider_profiles.owner_id = (select auth.uid())
      and provider_profiles.review_state in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_inventory_items.provider_id
      and provider_profiles.owner_id = (select auth.uid())
      and provider_profiles.review_state in ('draft', 'rejected')
  )
);

create policy "provider_inventory_owner_delete_editable"
on public.provider_inventory_items for delete to authenticated
using (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_inventory_items.provider_id
      and provider_profiles.owner_id = (select auth.uid())
      and provider_profiles.review_state in ('draft', 'rejected')
  )
);

create policy "provider_profile_reviews_owner_or_staff_select"
on public.provider_profile_reviews for select to authenticated
using (
  exists (
    select 1 from public.provider_profiles
    where provider_profiles.id = provider_profile_reviews.profile_id
      and provider_profiles.owner_id = (select auth.uid())
  )
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create or replace function public.submit_provider_profile(p_profile_id uuid)
returns public.provider_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_profile public.provider_profiles%rowtype;
begin
  select * into selected_profile
  from public.provider_profiles
  where id = p_profile_id
    and owner_id = caller_id
    and review_state in ('draft', 'rejected')
  for update;

  if not found then
    raise exception 'This provider profile cannot be submitted.' using errcode = 'P0002';
  end if;

  if char_length(btrim(selected_profile.summary)) < 40
    or not exists (select 1 from unnest(selected_profile.offerings) as offering where btrim(offering) <> '')
    or cardinality(selected_profile.sample_urls) < 1
    or exists (select 1 from unnest(selected_profile.sample_urls) as url where url !~ '^https://[^[:space:]/]+') then
    raise exception 'Complete the profile and add at least one HTTPS work sample.' using errcode = '22023';
  end if;

  if selected_profile.kind = 'equipment' and (
    btrim(selected_profile.delivery_details) = ''
    or btrim(selected_profile.setup_details) = ''
    or btrim(selected_profile.pickup_details) = ''
    or not exists (select 1 from public.provider_inventory_items where provider_id = p_profile_id)
  ) then
    raise exception 'Equipment rentals need inventory, delivery, setup, and pickup details.' using errcode = '22023';
  end if;

  update public.provider_profiles
  set review_state = 'pending', submitted_at = now(), reviewed_at = null
  where id = p_profile_id
  returning * into selected_profile;
  delete from public.provider_profile_reviews where profile_id = p_profile_id;
  return selected_profile;
end;
$$;

create or replace function public.review_provider_profile(p_profile_id uuid, p_decision text, p_review_note text default null)
returns public.provider_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_profile public.provider_profiles%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = caller_id) then
    raise exception 'Only assigned marketplace staff can review providers.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Review decision must be approved or rejected.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and char_length(btrim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'Add a review note before returning this profile.' using errcode = '22023';
  end if;

  update public.provider_profiles
  set review_state = p_decision,
      reviewed_at = now()
  where id = p_profile_id and review_state = 'pending'
  returning * into selected_profile;

  if not found then
    raise exception 'This provider profile is no longer waiting for review.' using errcode = 'P0002';
  end if;
  insert into public.provider_profile_reviews(profile_id, decision, review_note, reviewed_by, reviewed_at)
  values (p_profile_id, p_decision, case when p_decision = 'rejected' then btrim(p_review_note) else '' end, caller_id, selected_profile.reviewed_at)
  on conflict (profile_id) do update
  set decision = excluded.decision,
      review_note = excluded.review_note,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at;
  return selected_profile;
end;
$$;

revoke all on function public.submit_provider_profile(uuid) from public, anon;
revoke all on function public.review_provider_profile(uuid, text, text) from public, anon;
grant execute on function public.submit_provider_profile(uuid) to authenticated;
grant execute on function public.review_provider_profile(uuid, text, text) to authenticated;
