alter extension btree_gist set schema extensions;

revoke all on table public.reservations from authenticated;
grant select, insert on table public.reservations to authenticated;
grant update (status) on table public.reservations to authenticated;

drop policy if exists "reservations_guests_insert" on public.reservations;
create policy "reservations_guests_insert"
on public.reservations for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = guest_id
  and status = 'confirmed'
  and exists (
    select 1 from public.listings
    where listings.id = listing_id
      and listings.status = 'published'
      and listings.host_id <> (select auth.uid())
      and guests between 1 and listings.capacity
      and extract(epoch from (end_at - start_at)) / 3600 = trunc(extract(epoch from (end_at - start_at)) / 3600)
      and extract(epoch from (end_at - start_at)) / 3600 between listings.min_hours and 14
      and extract(hour from start_at at time zone 'UTC') >= 8
      and extract(hour from end_at at time zone 'UTC') <= 22
      and subtotal = round(listings.hourly_price * (extract(epoch from (end_at - start_at)) / 3600), 2)
      and guest_fee = round(subtotal * 0.12, 2)
      and total = subtotal + guest_fee
      and host_payout = subtotal
  )
);

drop policy if exists "reservations_parties_cancel" on public.reservations;
create policy "reservations_parties_cancel"
on public.reservations for update
to authenticated
using (
  (select auth.uid()) = guest_id
  or exists (
    select 1 from public.listings
    where listings.id = listing_id
      and listings.host_id = (select auth.uid())
  )
)
with check (
  status = 'cancelled'
  and (
    (select auth.uid()) = guest_id
    or exists (
      select 1 from public.listings
      where listings.id = listing_id
        and listings.host_id = (select auth.uid())
    )
  )
);

alter function public.create_reservation(uuid, timestamptz, timestamptz, integer) security invoker;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  cancelled_reservation public.reservations%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before cancelling a reservation.' using errcode = '42501';
  end if;

  update public.reservations as reservation
  set status = 'cancelled'
  where reservation.id = p_reservation_id
    and reservation.status in ('pending', 'confirmed')
  returning reservation.* into cancelled_reservation;

  if not found then
    raise exception 'This reservation cannot be cancelled.' using errcode = 'P0002';
  end if;

  return cancelled_reservation;
end;
$$;

revoke all on function public.create_reservation(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.create_reservation(uuid, timestamptz, timestamptz, integer) to authenticated;
revoke all on function public.cancel_reservation(uuid) from public, anon;
grant execute on function public.cancel_reservation(uuid) to authenticated;
