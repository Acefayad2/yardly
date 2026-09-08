create table if not exists public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null check (char_length(listing_key) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, listing_key)
);

alter table public.saved_listings enable row level security;

revoke all on table public.saved_listings from anon, authenticated;
grant select, insert, delete on table public.saved_listings to authenticated;

drop policy if exists "saved_listings_select_own" on public.saved_listings;
create policy "saved_listings_select_own"
on public.saved_listings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "saved_listings_insert_own" on public.saved_listings;
create policy "saved_listings_insert_own"
on public.saved_listings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "saved_listings_delete_own" on public.saved_listings;
create policy "saved_listings_delete_own"
on public.saved_listings for delete
to authenticated
using ((select auth.uid()) = user_id);
