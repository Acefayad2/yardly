create extension if not exists btree_gist with schema extensions;

alter table public.listings
  add column if not exists neighborhood text not null default '',
  add column if not exists host_display_name text not null default 'Yardly host',
  add column if not exists host_avatar_url text,
  add column if not exists timezone text not null default 'America/New_York';

alter table public.reservations
  add column if not exists listing_title text not null default 'Yardly space',
  add column if not exists listing_location text not null default '',
  add column if not exists listing_image text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_neighborhood_length'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_neighborhood_length
      check (char_length(neighborhood) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_coordinates_range'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_coordinates_range
      check (
        (latitude is null and longitude is null)
        or (latitude between -90 and 90 and longitude between -180 and 180)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'listings_published_complete'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_published_complete
      check (
        status <> 'published'
        or (
          cardinality(images) > 0
          and latitude is not null
          and longitude is not null
          and char_length(btrim(description)) >= 20
          and char_length(btrim(neighborhood)) >= 1
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_same_utc_day'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_same_utc_day
      check ((start_at at time zone 'UTC')::date = (end_at at time zone 'UTC')::date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_no_active_overlap'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_no_active_overlap
      exclude using gist (
        listing_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      ) where (status in ('pending', 'confirmed'));
  end if;
end $$;

create index if not exists listings_published_created_idx
  on public.listings (status, created_at desc)
  where status = 'published';
create index if not exists reservations_guest_start_idx
  on public.reservations (guest_id, start_at desc);
create index if not exists reservations_listing_start_idx
  on public.reservations (listing_id, start_at desc);

create or replace function public.set_reservation_listing_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select title, location, images[1]
  into new.listing_title, new.listing_location, new.listing_image
  from public.listings
  where id = new.listing_id;
  return new;
end;
$$;

drop trigger if exists reservations_set_listing_snapshot on public.reservations;
create trigger reservations_set_listing_snapshot before insert on public.reservations
for each row execute function public.set_reservation_listing_snapshot();

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

create or replace function public.create_reservation(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer
)
returns public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_listing public.listings%rowtype;
  duration_hours numeric;
  calculated_subtotal numeric(10, 2);
  calculated_fee numeric(10, 2);
  created_reservation public.reservations%rowtype;
begin
  if caller_id is null then
    raise exception 'Sign in before reserving a space.' using errcode = '42501';
  end if;

  select * into selected_listing
  from public.listings
  where id = p_listing_id and status = 'published';

  if not found then
    raise exception 'This space is not available for booking.' using errcode = 'P0002';
  end if;

  if selected_listing.host_id = caller_id then
    raise exception 'Hosts cannot reserve their own space.' using errcode = '22023';
  end if;

  if p_guests < 1 or p_guests > selected_listing.capacity then
    raise exception 'Guest count exceeds this space capacity.' using errcode = '22023';
  end if;

  if p_end_at <= p_start_at
    or (p_start_at at time zone 'UTC')::date <> (p_end_at at time zone 'UTC')::date then
    raise exception 'Reservations must start and end on the same date.' using errcode = '22023';
  end if;

  duration_hours := extract(epoch from (p_end_at - p_start_at)) / 3600;
  if duration_hours <> trunc(duration_hours)
    or duration_hours < selected_listing.min_hours
    or duration_hours > 14 then
    raise exception 'Choose a whole-hour duration within this space booking limits.' using errcode = '22023';
  end if;

  if extract(hour from p_start_at at time zone 'UTC') < 8
    or extract(hour from p_end_at at time zone 'UTC') > 22 then
    raise exception 'Reservations must be between 8:00 AM and 10:00 PM.' using errcode = '22023';
  end if;

  calculated_subtotal := round(selected_listing.hourly_price * duration_hours, 2);
  calculated_fee := round(calculated_subtotal * 0.12, 2);

  insert into public.reservations (
    listing_id,
    guest_id,
    start_at,
    end_at,
    guests,
    subtotal,
    guest_fee,
    total,
    host_payout,
    status
  ) values (
    selected_listing.id,
    caller_id,
    p_start_at,
    p_end_at,
    p_guests,
    calculated_subtotal,
    calculated_fee,
    calculated_subtotal + calculated_fee,
    calculated_subtotal,
    'confirmed'
  ) returning * into created_reservation;

  return created_reservation;
exception
  when exclusion_violation then
    raise exception 'That time is no longer available. Choose another time.' using errcode = '23P01';
end;
$$;

revoke all on function public.create_reservation(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.create_reservation(uuid, timestamptz, timestamptz, integer) to authenticated;

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
    and (
      reservation.guest_id = caller_id
      or exists (
        select 1 from public.listings
        where listings.id = reservation.listing_id
          and listings.host_id = caller_id
      )
    )
  returning reservation.* into cancelled_reservation;

  if not found then
    raise exception 'This reservation cannot be cancelled.' using errcode = 'P0002';
  end if;

  return cancelled_reservation;
end;
$$;

revoke all on function public.cancel_reservation(uuid) from public, anon;
grant execute on function public.cancel_reservation(uuid) to authenticated;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  guest_id uuid not null references auth.users(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_parties check (guest_id <> host_id),
  constraint conversations_listing_parties_unique unique (listing_id, guest_id, host_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists conversations_guest_updated_idx
  on public.conversations (guest_id, updated_at desc);
create index if not exists conversations_host_updated_idx
  on public.conversations (host_id, updated_at desc);
create index if not exists conversations_listing_idx
  on public.conversations (listing_id);
create index if not exists conversations_reservation_idx
  on public.conversations (reservation_id)
  where reservation_id is not null;
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx
  on public.messages (sender_id);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
for each row execute function public.touch_conversation_after_message();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations, public.messages from anon, authenticated;
grant select, insert on table public.conversations, public.messages to authenticated;
grant update (updated_at) on table public.conversations to authenticated;

drop policy if exists "conversations_parties_select" on public.conversations;
create policy "conversations_parties_select"
on public.conversations for select
to authenticated
using ((select auth.uid()) in (guest_id, host_id));

drop policy if exists "conversations_guests_insert" on public.conversations;
create policy "conversations_guests_insert"
on public.conversations for insert
to authenticated
with check (
  (select auth.uid()) = guest_id
  and guest_id <> host_id
  and exists (
    select 1 from public.listings
    where listings.id = listing_id
      and listings.host_id = host_id
      and listings.status = 'published'
  )
  and (
    reservation_id is null
    or exists (
      select 1 from public.reservations
      where reservations.id = reservation_id
        and reservations.listing_id = listing_id
        and reservations.guest_id = guest_id
    )
  )
);

drop policy if exists "conversations_parties_update" on public.conversations;
create policy "conversations_parties_update"
on public.conversations for update
to authenticated
using ((select auth.uid()) in (guest_id, host_id))
with check ((select auth.uid()) in (guest_id, host_id));

drop policy if exists "messages_parties_select" on public.messages;
create policy "messages_parties_select"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = conversation_id
      and (select auth.uid()) in (conversations.guest_id, conversations.host_id)
  )
);

drop policy if exists "messages_parties_insert" on public.messages;
create policy "messages_parties_insert"
on public.messages for insert
to authenticated
with check (
  (select auth.uid()) = sender_id
  and exists (
    select 1 from public.conversations
    where conversations.id = conversation_id
      and (select auth.uid()) in (conversations.guest_id, conversations.host_id)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
