-- Qualify correlated references: unqualified host_id/listing_id previously
-- resolved to the inner table, allowing unrelated conversation parties.
drop policy if exists "conversations_guests_insert" on public.conversations;
create policy "conversations_guests_insert"
on public.conversations for insert to authenticated
with check (
  (select auth.uid()) = conversations.guest_id
  and conversations.guest_id <> conversations.host_id
  and exists (
    select 1 from public.listings as listing
    where listing.id = conversations.listing_id
      and listing.host_id = conversations.host_id
      and listing.status = 'published'
  )
  and (
    conversations.reservation_id is null
    or exists (
      select 1 from public.reservations as reservation
      where reservation.id = conversations.reservation_id
        and reservation.listing_id = conversations.listing_id
        and reservation.guest_id = conversations.guest_id
    )
  )
);
