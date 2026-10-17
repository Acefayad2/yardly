create table public.community_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  space_type text not null check (space_type in ('park', 'gym', 'recreation_center', 'community_center', 'other')),
  location text not null check (char_length(btrim(location)) between 3 and 180),
  capacity integer check (capacity is null or capacity between 1 and 100000),
  amenities text[] not null default '{}',
  published_pricing text not null check (char_length(btrim(published_pricing)) between 2 and 500),
  restrictions text not null check (char_length(btrim(restrictions)) between 2 and 2000),
  source_name text not null check (char_length(btrim(source_name)) between 2 and 160),
  last_checked_at timestamptz,
  last_checked_by uuid references auth.users(id) on delete restrict,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_space_sources (
  space_id uuid primary key references public.community_spaces(id) on delete cascade,
  official_url text not null check (official_url ~ '^https://[^[:space:]/]+'),
  updated_at timestamptz not null default now()
);

create table public.community_space_checks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  checked_by uuid not null references auth.users(id) on delete restrict,
  source_status text not null check (source_status in ('current', 'changed', 'unavailable')),
  check_note text not null check (char_length(btrim(check_note)) between 3 and 1000),
  checked_at timestamptz not null default now()
);

create index community_spaces_published_checked_idx on public.community_spaces(last_checked_at desc) where is_published;
create index community_spaces_created_by_idx on public.community_spaces(created_by);
create index community_spaces_last_checked_by_idx on public.community_spaces(last_checked_by);
create index community_space_checks_space_idx on public.community_space_checks(space_id, checked_at desc);
create index community_space_checks_checked_by_idx on public.community_space_checks(checked_by);

create trigger community_spaces_set_updated_at before update on public.community_spaces
for each row execute function public.set_updated_at();

alter table public.community_spaces enable row level security;
alter table public.community_space_sources enable row level security;
alter table public.community_space_checks enable row level security;
revoke all on table public.community_spaces, public.community_space_sources, public.community_space_checks from anon, authenticated;
grant select on table public.community_spaces, public.community_space_sources to anon, authenticated;
grant select on table public.community_space_checks to authenticated;

create policy "community_spaces_public_or_staff_select"
on public.community_spaces for select to anon, authenticated
using (is_published or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())));

create policy "community_space_sources_fresh_public_or_staff_select"
on public.community_space_sources for select to anon, authenticated
using (
  exists (
    select 1 from public.community_spaces
    where id = community_space_sources.space_id and is_published and last_checked_at >= now() - interval '7 days'
  )
  or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
);

create policy "community_space_checks_staff_select"
on public.community_space_checks for select to authenticated
using (exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())));

create or replace function public.save_community_space(
  p_id uuid, p_name text, p_space_type text, p_location text, p_capacity integer,
  p_amenities text[], p_published_pricing text, p_restrictions text,
  p_official_url text, p_source_name text
)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can manage community spaces.' using errcode = '42501';
  end if;
  if p_space_type not in ('park', 'gym', 'recreation_center', 'community_center', 'other')
    or char_length(btrim(p_name)) < 2 or char_length(btrim(p_location)) < 3
    or (p_capacity is not null and (p_capacity < 1 or p_capacity > 100000)) or coalesce(cardinality(p_amenities), 0) < 1
    or char_length(btrim(p_published_pricing)) < 2 or char_length(btrim(p_restrictions)) < 2
    or p_official_url !~ '^https://[^[:space:]/]+' or char_length(btrim(p_source_name)) < 2 then
    raise exception 'Complete the directory entry with an official HTTPS source.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.community_spaces(name, space_type, location, capacity, amenities, published_pricing, restrictions, source_name, created_by)
    values (btrim(p_name), p_space_type, btrim(p_location), p_capacity, p_amenities, btrim(p_published_pricing), btrim(p_restrictions), btrim(p_source_name), (select auth.uid()))
    returning * into result;
  else
    update public.community_spaces set name = btrim(p_name), space_type = p_space_type, location = btrim(p_location),
      capacity = p_capacity, amenities = p_amenities, published_pricing = btrim(p_published_pricing), restrictions = btrim(p_restrictions),
      source_name = btrim(p_source_name), is_published = false, last_checked_at = null, last_checked_by = null
    where id = p_id returning * into result;
    if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  end if;
  insert into public.community_space_sources(space_id, official_url) values (result.id, p_official_url)
  on conflict (space_id) do update set official_url = excluded.official_url, updated_at = now();
  return result;
end;
$$;

create or replace function public.record_community_space_check(p_space_id uuid, p_source_status text, p_check_note text)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can verify community spaces.' using errcode = '42501';
  end if;
  if p_source_status not in ('current', 'changed', 'unavailable') or char_length(btrim(p_check_note)) < 3 then
    raise exception 'Record the source status and verification note.' using errcode = '22023';
  end if;
  insert into public.community_space_checks(space_id, checked_by, source_status, check_note)
  values (p_space_id, (select auth.uid()), p_source_status, btrim(p_check_note));
  update public.community_spaces set last_checked_at = now(), last_checked_by = (select auth.uid()),
    is_published = case when p_source_status = 'current' then is_published else false end
  where id = p_space_id returning * into result;
  if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.set_community_space_published(p_space_id uuid, p_published boolean)
returns public.community_spaces
language plpgsql security definer set search_path = ''
as $$
declare result public.community_spaces%rowtype;
begin
  if not exists (select 1 from public.marketplace_staff where user_id = (select auth.uid())) then
    raise exception 'Only assigned staff can publish community spaces.' using errcode = '42501';
  end if;
  if p_published and not exists (
    select 1 from public.community_spaces
    where id = p_space_id and last_checked_at >= now() - interval '7 days'
  ) then raise exception 'Recheck the official source before publishing.' using errcode = '22023'; end if;
  update public.community_spaces set is_published = p_published where id = p_space_id returning * into result;
  if not found then raise exception 'This directory entry does not exist.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.save_community_space(uuid, text, text, text, integer, text[], text, text, text, text) from public, anon;
revoke all on function public.record_community_space_check(uuid, text, text) from public, anon;
revoke all on function public.set_community_space_published(uuid, boolean) from public, anon;
grant execute on function public.save_community_space(uuid, text, text, text, integer, text[], text, text, text, text) to authenticated;
grant execute on function public.record_community_space_check(uuid, text, text) to authenticated;
grant execute on function public.set_community_space_published(uuid, boolean) to authenticated;
