-- Private exact street address per listing. Public listings.latitude/longitude
-- stay rounded and publicly readable (unchanged); the real street address is
-- readable only by the listing's host or a guest with a confirmed reservation
-- on that listing, never by anon or unrelated users.
create table public.listing_addresses (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  street_address text not null check (char_length(btrim(street_address)) between 5 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists listing_addresses_set_updated_at on public.listing_addresses;
create trigger listing_addresses_set_updated_at before update on public.listing_addresses
for each row execute function public.set_updated_at();

alter table public.listing_addresses enable row level security;

revoke all on public.listing_addresses from public, anon;
grant select, insert, update on public.listing_addresses to authenticated;

drop policy if exists "listing_addresses_hosts_insert_own" on public.listing_addresses;
create policy "listing_addresses_hosts_insert_own" on public.listing_addresses for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_addresses.listing_id
      and listings.host_id = (select auth.uid())
  )
);

drop policy if exists "listing_addresses_hosts_update_own" on public.listing_addresses;
create policy "listing_addresses_hosts_update_own" on public.listing_addresses for update to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_addresses.listing_id
      and listings.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_addresses.listing_id
      and listings.host_id = (select auth.uid())
  )
);

drop policy if exists "listing_addresses_parties_read" on public.listing_addresses;
create policy "listing_addresses_parties_read" on public.listing_addresses for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_addresses.listing_id
      and listings.host_id = (select auth.uid())
  )
  or exists (
    select 1 from public.reservations
    where reservations.listing_id = listing_addresses.listing_id
      and reservations.guest_id = (select auth.uid())
      and reservations.status = 'confirmed'
  )
);
-- No anon policy at all: anonymous visitors get zero rows from this table.

-- Extend the existing listing validation trigger (already fires on status
-- changes) so a listing cannot be published without a stored private address.
create or replace function public.validate_listing_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare day_hours jsonb;
begin
  -- Serialize schedule changes with reservation inserts, including direct REST writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 0));
  if jsonb_typeof(new.weekly_hours) <> 'array' or jsonb_array_length(new.weekly_hours) <> 7 then
    raise exception 'Provide opening hours for all seven weekdays.' using errcode = '22023';
  end if;
  for day_hours in select value from jsonb_array_elements(new.weekly_hours) loop
    if day_hours = 'null'::jsonb then continue; end if;
    if jsonb_typeof(day_hours) <> 'array' or jsonb_array_length(day_hours) <> 2
      or jsonb_typeof(day_hours->0) <> 'number' or jsonb_typeof(day_hours->1) <> 'number' then
      raise exception 'Each open day needs a start and end hour.' using errcode = '22023';
    end if;
    if (day_hours->>0)::numeric <> trunc((day_hours->>0)::numeric)
      or (day_hours->>1)::numeric <> trunc((day_hours->>1)::numeric)
      or (day_hours->>0)::numeric < 8 or (day_hours->>1)::numeric > 22
      or (day_hours->>1)::numeric - (day_hours->>0)::numeric < new.min_hours then
      raise exception 'Opening hours must be whole hours between 8 AM and 10 PM, with room for the minimum booking.' using errcode = '22023';
    end if;
  end loop;
  if cardinality(new.blocked_dates) > 730 or array_position(new.blocked_dates, null) is not null then
    raise exception 'Choose up to 730 valid blocked dates.' using errcode = '22023';
  end if;
  -- Only the explicit draft-to-published transition is guarded here (the only path
  -- the app itself ever takes — new listings always insert as 'draft'). A row's own
  -- private address cannot exist yet at INSERT time regardless (listing_addresses.listing_id
  -- is a foreign key to this row's id), so a direct insert-as-published is caught the
  -- next time anyone updates that row, same as every other listing validation above.
  if tg_op = 'UPDATE' and new.status = 'published' and not exists (
    select 1 from public.listing_addresses where listing_addresses.listing_id = new.id
  ) then
    raise exception 'Add a private street address before publishing this listing.' using errcode = '22023';
  end if;
  return new;
end;
$$;
