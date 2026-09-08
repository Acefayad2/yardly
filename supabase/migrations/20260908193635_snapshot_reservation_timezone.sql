alter table public.reservations
  add column if not exists listing_timezone text not null default 'America/New_York';

create or replace function public.set_reservation_listing_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select title, location, images[1], timezone
  into new.listing_title, new.listing_location, new.listing_image, new.listing_timezone
  from public.listings
  where id = new.listing_id;
  return new;
end;
$$;
