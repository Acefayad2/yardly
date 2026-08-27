create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  account_type text not null default 'guest' check (account_type in ('guest', 'host', 'both')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  location text not null check (char_length(location) between 2 and 160),
  space_type text not null check (space_type in ('Backyards', 'Pools', 'Outdoor kitchens', 'Patios & decks', 'Gardens', 'Fire pits', 'Rooftops', 'Sport courts', 'Event yards', 'Hot tubs')),
  hourly_price numeric(10, 2) not null check (hourly_price >= 10),
  day_price numeric(10, 2) check (day_price is null or day_price >= hourly_price),
  min_hours integer not null default 1 check (min_hours between 1 and 24),
  capacity integer not null check (capacity between 1 and 200),
  description text not null default '',
  amenities text[] not null default '{}',
  rules text[] not null default '{}',
  images text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  status text not null default 'draft' check (status in ('draft', 'published', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  guest_id uuid not null references auth.users(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  guests integer not null check (guests > 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  guest_fee numeric(10, 2) not null default 0 check (guest_fee >= 0),
  total numeric(10, 2) not null check (total >= 0),
  host_payout numeric(10, 2) not null check (host_payout >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_host_id_idx on public.listings(host_id);
create index if not exists listings_status_idx on public.listings(status);
create index if not exists reservations_listing_id_idx on public.reservations(listing_id);
create index if not exists reservations_guest_id_idx on public.reservations(guest_id);
create index if not exists reservations_start_at_idx on public.reservations(start_at);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at before update on public.listings
for each row execute function public.set_updated_at();
drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated;
grant select on public.listings to anon;
grant select, insert, update, delete on public.profiles, public.listings, public.reservations to authenticated;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "listings_anon_read_published" on public.listings;
create policy "listings_anon_read_published" on public.listings for select to anon
using (status = 'published');
drop policy if exists "listings_authenticated_read" on public.listings;
create policy "listings_authenticated_read" on public.listings for select to authenticated
using (status = 'published' or host_id = (select auth.uid()));
drop policy if exists "listings_hosts_insert_own" on public.listings;
create policy "listings_hosts_insert_own" on public.listings for insert to authenticated
with check ((select auth.uid()) = host_id);
drop policy if exists "listings_hosts_update_own" on public.listings;
create policy "listings_hosts_update_own" on public.listings for update to authenticated
using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
drop policy if exists "listings_hosts_delete_own" on public.listings;
create policy "listings_hosts_delete_own" on public.listings for delete to authenticated
using ((select auth.uid()) = host_id);

drop policy if exists "reservations_parties_read" on public.reservations;
create policy "reservations_parties_read" on public.reservations for select to authenticated
using (
  (select auth.uid()) = guest_id
  or exists (
    select 1 from public.listings
    where listings.id = reservations.listing_id
      and listings.host_id = (select auth.uid())
  )
);
drop policy if exists "reservations_guests_insert" on public.reservations;
create policy "reservations_guests_insert" on public.reservations for insert to authenticated
with check (
  (select auth.uid()) = guest_id
  and exists (
    select 1 from public.listings
    where listings.id = reservations.listing_id
      and listings.status = 'published'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing_images_public_read" on storage.objects;
create policy "listing_images_public_read" on storage.objects for select to public
using (bucket_id = 'listing-images');
drop policy if exists "listing_images_owner_insert" on storage.objects;
create policy "listing_images_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "listing_images_owner_update" on storage.objects;
create policy "listing_images_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "listing_images_owner_delete" on storage.objects;
create policy "listing_images_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
