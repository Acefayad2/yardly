create table public.church_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  church_name text not null check (char_length(btrim(church_name)) between 2 and 120),
  space_name text not null check (char_length(btrim(space_name)) between 2 and 120),
  location text not null check (char_length(btrim(location)) between 3 and 180),
  description text not null check (char_length(btrim(description)) between 40 and 2000),
  capacity integer not null check (capacity between 1 and 100000),
  published_price text not null check (char_length(btrim(published_price)) between 2 and 240),
  amenities text[] not null default '{}',
  rules text not null check (char_length(btrim(rules)) between 10 and 2000),
  booking_contact_name text not null check (char_length(btrim(booking_contact_name)) between 2 and 120),
  photo_urls text[] not null default '{}',
  photo_permission_granted boolean not null default false,
  owner_approved_at timestamptz,
  review_state text not null default 'draft' check (review_state in ('draft', 'pending', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.church_photo_permissions (
  church_id uuid primary key references public.church_listings(id) on delete cascade,
  permission_granted boolean not null,
  permission_statement text not null check (char_length(btrim(permission_statement)) between 10 and 1000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.church_listing_reviews (
  church_id uuid primary key references public.church_listings(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create table public.church_event_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.church_listings(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  guest_count integer not null check (guest_count between 1 and 100000),
  event_type text not null check (char_length(btrim(event_type)) between 2 and 120),
  details text not null check (char_length(btrim(details)) between 10 and 3000),
  status text not null default 'waiting_for_reply' check (status in ('waiting_for_reply', 'accepted', 'declined', 'closed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_event_requests_valid_hours check (end_time > start_time)
);

create index church_listings_owner_idx on public.church_listings(owner_id);
create index church_listings_public_idx on public.church_listings(reviewed_at desc) where review_state = 'approved';
create index church_event_requests_customer_idx on public.church_event_requests(customer_id, updated_at desc);
create index church_event_requests_church_idx on public.church_event_requests(church_id, updated_at desc);
create index church_photo_permissions_recorded_by_idx on public.church_photo_permissions(recorded_by);
create index church_listing_reviews_reviewed_by_idx on public.church_listing_reviews(reviewed_by);

create trigger church_listings_set_updated_at before update on public.church_listings
for each row execute function public.set_updated_at();
create trigger church_event_requests_set_updated_at before update on public.church_event_requests
for each row execute function public.set_updated_at();

alter table public.church_listings enable row level security;
alter table public.church_photo_permissions enable row level security;
alter table public.church_listing_reviews enable row level security;
alter table public.church_event_requests enable row level security;

revoke all on table public.church_listings, public.church_photo_permissions, public.church_listing_reviews, public.church_event_requests from anon, authenticated;
grant select on table public.church_listings to anon, authenticated;
grant insert (owner_id, church_name, space_name, location, description, capacity, published_price, amenities, rules, booking_contact_name, photo_urls) on public.church_listings to authenticated;
grant update (church_name, space_name, location, description, capacity, published_price, amenities, rules, booking_contact_name, photo_urls) on public.church_listings to authenticated;
grant select on table public.church_photo_permissions, public.church_listing_reviews, public.church_event_requests to authenticated;

create policy "church_listings_public_owner_or_staff_select"
on public.church_listings for select to anon, authenticated
using (
  (review_state = 'approved' and owner_approved_at is not null and photo_permission_granted)
  or owner_id = (select auth.uid())
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "church_listings_owner_insert_draft"
on public.church_listings for insert to authenticated
with check (owner_id = (select auth.uid()) and review_state = 'draft' and owner_approved_at is null);

create policy "church_listings_owner_update_editable"
on public.church_listings for update to authenticated
using (owner_id = (select auth.uid()) and review_state in ('draft', 'rejected'))
with check (owner_id = (select auth.uid()) and review_state in ('draft', 'rejected'));

create policy "church_photo_permissions_owner_or_staff_select"
on public.church_photo_permissions for select to authenticated
using (
  exists (select 1 from public.church_listings where id = church_photo_permissions.church_id and owner_id = (select auth.uid()))
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "church_listing_reviews_owner_or_staff_select"
on public.church_listing_reviews for select to authenticated
using (
  exists (select 1 from public.church_listings where id = church_listing_reviews.church_id and owner_id = (select auth.uid()))
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "church_event_requests_participants_or_staff_select"
on public.church_event_requests for select to authenticated
using (
  customer_id = (select auth.uid())
  or exists (select 1 from public.church_listings where id = church_event_requests.church_id and owner_id = (select auth.uid()))
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create or replace function public.record_church_photo_permission(p_church_id uuid, p_permission_granted boolean, p_permission_statement text)
returns public.church_photo_permissions
language plpgsql security definer set search_path = ''
as $$
declare result public.church_photo_permissions%rowtype;
begin
  if not exists (
    select 1 from public.church_listings
    where id = p_church_id and owner_id = (select auth.uid())
      and (review_state in ('draft', 'rejected') or not p_permission_granted)
  ) then raise exception 'This church photo permission cannot be changed.' using errcode = 'P0002'; end if;
  if char_length(btrim(p_permission_statement)) < 10 then raise exception 'Record how photo permission was granted or declined.' using errcode = '22023'; end if;
  insert into public.church_photo_permissions(church_id, permission_granted, permission_statement, recorded_by)
  values (p_church_id, p_permission_granted, btrim(p_permission_statement), (select auth.uid()))
  on conflict (church_id) do update set permission_granted = excluded.permission_granted,
    permission_statement = excluded.permission_statement, recorded_by = excluded.recorded_by, recorded_at = now()
  returning * into result;
  update public.church_listings set photo_permission_granted = p_permission_granted,
    review_state = case when p_permission_granted then review_state else 'draft' end,
    owner_approved_at = case when p_permission_granted then owner_approved_at else null end,
    reviewed_at = case when p_permission_granted then reviewed_at else null end
  where id = p_church_id;
  return result;
end;
$$;

create or replace function public.submit_church_listing(p_church_id uuid)
returns public.church_listings
language plpgsql security definer set search_path = ''
as $$
declare result public.church_listings%rowtype;
begin
  select * into result from public.church_listings
  where id = p_church_id and owner_id = (select auth.uid()) and review_state in ('draft', 'rejected') for update;
  if not found then raise exception 'This church listing cannot be submitted.' using errcode = 'P0002'; end if;
  if cardinality(result.amenities) < 1 or cardinality(result.photo_urls) < 1
    or exists (select 1 from unnest(result.photo_urls) url where url !~ '^https://[^[:space:]/]+') then
    raise exception 'Add amenities and at least one HTTPS church photo.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.church_photo_permissions
    where church_id = p_church_id and permission_granted
  ) then raise exception 'Recorded photo permission is required before submission.' using errcode = '22023'; end if;
  update public.church_listings set owner_approved_at = now(), review_state = 'pending', submitted_at = now(), reviewed_at = null
  where id = p_church_id returning * into result;
  delete from public.church_listing_reviews where church_id = p_church_id;
  return result;
end;
$$;

create or replace function public.review_church_listing(p_church_id uuid, p_decision text, p_review_note text default null)
returns public.church_listings
language plpgsql security definer set search_path = ''
as $$
declare result public.church_listings%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can review church listings.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Review decision must be approved or rejected.' using errcode = '22023'; end if;
  if p_decision = 'rejected' and char_length(btrim(coalesce(p_review_note, ''))) < 3 then raise exception 'Add a review note.' using errcode = '22023'; end if;
  update public.church_listings set review_state = p_decision, reviewed_at = now()
  where id = p_church_id and review_state = 'pending' and owner_approved_at is not null
    and exists (select 1 from public.church_photo_permissions where church_id = p_church_id and permission_granted)
  returning * into result;
  if not found then raise exception 'This church listing is no longer ready for review.' using errcode = 'P0002'; end if;
  insert into public.church_listing_reviews(church_id, decision, review_note, reviewed_by, reviewed_at)
  values (p_church_id, p_decision, case when p_decision = 'rejected' then btrim(p_review_note) else '' end, (select auth.uid()), result.reviewed_at)
  on conflict (church_id) do update set decision = excluded.decision, review_note = excluded.review_note,
    reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  return result;
end;
$$;

create or replace function public.create_church_event_request(
  p_church_id uuid, p_event_date date, p_start_time time, p_end_time time,
  p_guest_count integer, p_event_type text, p_details text
)
returns public.church_event_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.church_event_requests%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in before requesting a church space.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.church_listings listing
    where listing.id = p_church_id and listing.review_state = 'approved' and listing.owner_approved_at is not null
      and listing.owner_id <> (select auth.uid())
      and listing.photo_permission_granted
  ) then raise exception 'This church space is not available for requests.' using errcode = 'P0002'; end if;
  if p_event_date < current_date or p_end_time <= p_start_time or p_guest_count < 1
    or char_length(btrim(p_event_type)) < 2 or char_length(btrim(p_details)) < 10 then
    raise exception 'Complete the event date, hours, guest count, type, and details.' using errcode = '22023';
  end if;
  insert into public.church_event_requests(church_id, customer_id, event_date, start_time, end_time, guest_count, event_type, details)
  values (p_church_id, (select auth.uid()), p_event_date, p_start_time, p_end_time, p_guest_count, btrim(p_event_type), btrim(p_details))
  returning * into result;
  return result;
end;
$$;

create or replace function public.decide_church_event_request(p_request_id uuid, p_decision text)
returns public.church_event_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.church_event_requests%rowtype;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'Decision must be accepted or declined.' using errcode = '22023'; end if;
  update public.church_event_requests request set status = p_decision, decided_at = now()
  from public.church_listings listing
  where request.id = p_request_id and request.status = 'waiting_for_reply'
    and listing.id = request.church_id and listing.owner_id = (select auth.uid())
  returning request.* into result;
  if not found then raise exception 'This church request cannot be decided.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.close_church_event_request(p_request_id uuid)
returns public.church_event_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.church_event_requests%rowtype;
begin
  update public.church_event_requests request set status = 'closed'
  where request.id = p_request_id and request.status <> 'closed' and (
    request.customer_id = (select auth.uid()) or exists (
      select 1 from public.church_listings where id = request.church_id and owner_id = (select auth.uid())
    )
  ) returning request.* into result;
  if not found then raise exception 'This church request cannot be closed.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.record_church_photo_permission(uuid, boolean, text) from public, anon;
revoke all on function public.submit_church_listing(uuid) from public, anon;
revoke all on function public.review_church_listing(uuid, text, text) from public, anon;
revoke all on function public.create_church_event_request(uuid, date, time, time, integer, text, text) from public, anon;
revoke all on function public.decide_church_event_request(uuid, text) from public, anon;
revoke all on function public.close_church_event_request(uuid) from public, anon;
grant execute on function public.record_church_photo_permission(uuid, boolean, text) to authenticated;
grant execute on function public.submit_church_listing(uuid) to authenticated;
grant execute on function public.review_church_listing(uuid, text, text) to authenticated;
grant execute on function public.create_church_event_request(uuid, date, time, time, integer, text, text) to authenticated;
grant execute on function public.decide_church_event_request(uuid, text) to authenticated;
grant execute on function public.close_church_event_request(uuid) to authenticated;
