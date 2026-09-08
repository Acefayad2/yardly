alter table public.reservations
  add column if not exists listing_title text not null default 'Yardly space',
  add column if not exists listing_location text not null default '',
  add column if not exists listing_image text;

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
