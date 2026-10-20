-- A small, host-authored guide. Access does not depend on a listing staying published.
create table public.listing_recommendations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  slot smallint not null check (slot between 1 and 6),
  name text not null check (length(btrim(name)) between 1 and 100),
  category text not null check (category in ('Food & drink', 'Parks & outdoors', 'Attractions', 'Essentials')),
  address text not null check (length(btrim(address)) between 3 and 240),
  note text not null default '' check (length(note) <= 400),
  primary key (listing_id, slot)
);
alter table public.listing_recommendations enable row level security;
revoke all on public.listing_recommendations from anon, authenticated;
grant select, insert, update, delete on public.listing_recommendations to authenticated;
create policy "Hosts manage their own recommendations"
on public.listing_recommendations for all to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.host_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.host_id = (select auth.uid())));
create policy "Booked guests read recommendations"
on public.listing_recommendations for select to authenticated
using (exists (select 1 from public.reservations r where r.listing_id = listing_recommendations.listing_id
  and r.guest_id = (select auth.uid()) and r.status in ('confirmed', 'completed')));
