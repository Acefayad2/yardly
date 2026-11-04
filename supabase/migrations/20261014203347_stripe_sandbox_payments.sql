-- SANDBOX RELEASE: do not apply to production until the paid-booking UI is deployed.
-- Money is integer USD cents. A pending reservation holds availability until Stripe
-- verifies expiry or payment; browser redirects never confirm a reservation.
create table public.payment_settings (
  id boolean primary key default true check (id),
  guest_fee_bps integer not null default 1200 check (guest_fee_bps between 0 and 10000)
);
insert into public.payment_settings values (true, 1200);
alter table public.payment_settings enable row level security;
revoke all on public.payment_settings from public, anon, authenticated;
grant select on public.payment_settings to anon, authenticated;
create policy payment_settings_read on public.payment_settings for select to anon, authenticated using (true);
grant all on public.payment_settings to service_role;

create table public.host_stripe_accounts (
  host_id uuid primary key references auth.users(id),
  account_id text unique not null check (account_id like 'acct_%'),
  ready boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.host_stripe_accounts enable row level security;
revoke all on public.host_stripe_accounts from public, anon, authenticated;
grant select on public.host_stripe_accounts to authenticated;
grant all on public.host_stripe_accounts to service_role;
create policy host_stripe_read on public.host_stripe_accounts for select to authenticated
  using (host_id = (select auth.uid()));

alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending','confirmed','completed','cancelled'));
alter table public.reservations drop constraint reservations_no_active_overlap;
alter table public.reservations add constraint reservations_no_active_overlap exclude using gist
  (listing_id with =, tstzrange(start_at,end_at,'[)') with &&) where (status in ('pending','confirmed'));
-- Close the old no-payment RPC AND direct REST insert/update bypasses.
revoke insert, update, delete on public.reservations from authenticated;
revoke update (status) on public.reservations from authenticated;
revoke execute on function public.create_reservation(uuid,date,time,time,integer) from authenticated;
revoke execute on function public.cancel_reservation(uuid) from authenticated;

create table public.payment_orders (
  id uuid primary key references public.reservations(id),
  guest_id uuid not null references auth.users(id),
  host_id uuid not null references auth.users(id),
  account_id text not null,
  request_id uuid not null,
  subtotal_cents integer not null check (subtotal_cents > 0),
  fee_bps integer not null check (fee_bps between 0 and 10000),
  fee_cents integer not null check (fee_cents >= 0),
  total_cents integer not null check (total_cents = subtotal_cents + fee_cents),
  state text not null default 'pending' check (state in ('pending','paid','expired','refund_requested','refunded','blocked','releasing','transferred')),
  session_id text unique,
  payment_intent_id text unique,
  charge_id text unique,
  transfer_id text unique,
  refund_id text unique,
  operation_started_at timestamptz,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (guest_id,request_id)
);
alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from public, anon, authenticated;
grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;
create policy payment_orders_read on public.payment_orders for select to authenticated
  using ((select auth.uid()) in (guest_id,host_id));
create index payment_orders_work on public.payment_orders(state,created_at);
create index payment_orders_host on public.payment_orders(host_id);
create index payment_orders_guest on public.payment_orders(guest_id);

create function public.prepare_payment_order(p_guest uuid,p_request uuid,p_listing uuid,p_date date,p_start time,p_end time,p_guests integer)
returns public.payment_orders language plpgsql security invoker set search_path='' as $$
declare yard public.listings; existing public.payment_orders; host_account public.host_stripe_accounts;
  start_time timestamptz; end_time timestamptz; hours numeric; subtotal integer; fee integer; bps integer; reservation_id uuid;
begin
  if p_guest is null or p_request is null or p_date is null or p_start is null or p_end is null or p_guests is null then
    raise exception 'Missing booking details.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_guest::text || p_request::text,0));
  select * into existing from public.payment_orders where guest_id=p_guest and request_id=p_request;
  if found then return existing; end if;
  if (select count(*) from public.payment_orders where guest_id=p_guest and state='pending')>=3 then
    raise exception 'Finish an existing checkout before starting another.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_listing::text,0));
  select * into yard from public.listings where id=p_listing and status='published';
  if not found or yard.host_id=p_guest then raise exception 'Space unavailable.' using errcode='22023'; end if;
  select * into host_account from public.host_stripe_accounts where host_id=yard.host_id and ready;
  if not found then raise exception 'The host must finish payment setup first.' using errcode='22023'; end if;
  start_time := (p_date+p_start) at time zone yard.timezone;
  end_time := (p_date+p_end) at time zone yard.timezone;
  hours := extract(epoch from (end_time-start_time))/3600;
  if not isfinite(p_date) or start_time <= now()+interval '40 minutes' or p_end<=p_start
    or hours<>trunc(hours) or hours<yard.min_hours or hours>14 or p_guests not between 1 and yard.capacity then
    raise exception 'Choose valid future hours and guest count.' using errcode='22023';
  end if;
  select guest_fee_bps into strict bps from public.payment_settings where id;
  subtotal := round(yard.hourly_price*100)*hours;
  fee := round(subtotal::numeric*bps/10000);
  insert into public.reservations(listing_id,guest_id,start_at,end_at,guests,subtotal,guest_fee,total,host_payout,status)
    values(p_listing,p_guest,start_time,end_time,p_guests,subtotal/100.0,fee/100.0,(subtotal+fee)/100.0,subtotal/100.0,'pending') returning id into reservation_id;
  insert into public.payment_orders(id,guest_id,host_id,account_id,request_id,subtotal_cents,fee_bps,fee_cents,total_cents)
    values(reservation_id,p_guest,yard.host_id,host_account.account_id,p_request,subtotal,bps,fee,subtotal+fee) returning * into existing;
  return existing;
end $$;
revoke all on function public.prepare_payment_order(uuid,uuid,uuid,date,time,time,integer) from public,anon,authenticated;
grant execute on function public.prepare_payment_order(uuid,uuid,uuid,date,time,time,integer) to service_role;

-- Serialize cancellation, payment confirmation and payout claims on one ledger row.
create function public.transition_payment_order(p_id uuid,p_action text,p_value text default null,p_actor uuid default null)
returns public.payment_orders language plpgsql security invoker set search_path='' as $$
declare payment public.payment_orders; booking public.reservations;
begin
  select * into strict payment from public.payment_orders where id=p_id for update;
  select * into strict booking from public.reservations where id=p_id for update;
  if p_action='paid' and payment.state='pending' then
    if booking.start_at<=now() then
      update public.payment_orders set state='refund_requested' where id=p_id;
      update public.reservations set status='cancelled' where id=p_id;
    else
      update public.payment_orders set state='paid' where id=p_id;
      update public.reservations set status='confirmed' where id=p_id;
    end if;
  elsif p_action='expired' and payment.state='pending' then
    update public.payment_orders set state='expired' where id=p_id;
    update public.reservations set status='cancelled' where id=p_id;
  elsif p_action='cancel' then
    if p_actor is null or p_actor not in (payment.guest_id,payment.host_id) then raise exception 'Not authorized.' using errcode='42501'; end if;
    if payment.state in ('refund_requested','refunded') then return payment; end if;
    if payment.state<>'paid' or booking.start_at<=now() then raise exception 'Contact support to review this cancellation.' using errcode='22023'; end if;
    update public.payment_orders set state='refund_requested' where id=p_id;
    update public.reservations set status='cancelled' where id=p_id;
  elsif p_action='block' and payment.state not in ('refunded','expired') then
    update public.payment_orders set state='blocked' where id=p_id;
  elsif p_action='claim_transfer' then
    if payment.state<>'paid' or booking.end_at>now() or booking.status not in ('confirmed','completed') then return null; end if;
    update public.payment_orders set state='releasing',operation_started_at=now() where id=p_id;
  elsif p_action='transferred' and payment.state='releasing' then
    update public.payment_orders set state='transferred',transfer_id=p_value where id=p_id;
  elsif p_action='refunded' and payment.state in ('refund_requested','blocked','paid','pending') then
    update public.payment_orders set state='refunded',refund_id=p_value where id=p_id;
    update public.reservations set status='cancelled' where id=p_id;
  end if;
  select * into payment from public.payment_orders where id=p_id;
  return payment;
end $$;
revoke all on function public.transition_payment_order(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.transition_payment_order(uuid,text,text,uuid) to service_role;

-- Pending checkouts must disappear from public availability as well as the exclusion constraint.
create or replace function private.booking_slots(p_listing_id uuid,p_booking_date date)
returns table(start_hour integer,end_hour integer) language plpgsql stable security definer set search_path='' as $$
declare yard public.listings; day_hours jsonb;
begin
  select * into yard from public.listings where id=p_listing_id and status='published';
  if not found or p_booking_date is null or not isfinite(p_booking_date) then return; end if;
  if p_booking_date<(now() at time zone yard.timezone)::date or p_booking_date=any(yard.blocked_dates) then return; end if;
  day_hours:=yard.weekly_hours->extract(dow from p_booking_date)::int;
  if day_hours='null'::jsonb then return; end if;
  return query select s,e from generate_series((day_hours->>0)::int,(day_hours->>1)::int-yard.min_hours) s
    cross join lateral generate_series(s+yard.min_hours,(day_hours->>1)::int) e
    where ((p_booking_date+make_time(s,0,0)) at time zone yard.timezone)>now()+interval '40 minutes'
    and not exists(select 1 from public.reservations r where r.listing_id=yard.id and r.status in ('pending','confirmed')
      and r.start_at<((p_booking_date+make_time(e,0,0)) at time zone yard.timezone)
      and r.end_at>((p_booking_date+make_time(s,0,0)) at time zone yard.timezone)) order by s,e;
end $$;
