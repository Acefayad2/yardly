-- SANDBOX RELEASE: review access for held refunds and disputes.
-- Owner policy: post-payout refunds and disputes are held for staff review instead of
-- automatic recovery. Staff record decisions here; money is moved by hand in Stripe.
create table public.payment_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 200)
);
alter table public.payment_staff enable row level security;
revoke all on public.payment_staff from public, anon, authenticated;
grant select on public.payment_staff to authenticated;
grant all on public.payment_staff to service_role;
-- A staff member may confirm only their own access; the roster is never public.
create policy payment_staff_read_self on public.payment_staff for select to authenticated
  using (user_id = (select auth.uid()));

create table public.payment_reviews (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.payment_orders(id),
  staff_id uuid not null references auth.users(id),
  decision text not null check (decision in ('noted','refund_guest','release_host','no_action')),
  note text not null check (length(btrim(note)) between 1 and 1000),
  order_state text not null,
  charge_id text,
  transfer_id text,
  refund_id text,
  created_at timestamptz not null default now()
);
alter table public.payment_reviews enable row level security;
revoke all on public.payment_reviews from public, anon, authenticated;
grant select, insert on public.payment_reviews to service_role;
create index payment_reviews_order on public.payment_reviews(order_id, created_at desc);

-- Append-only: the audit trail must survive even a compromised backend key.
create function private.keep_payment_reviews_append_only() returns trigger
  language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Payment review history cannot be changed or removed.' using errcode = '42501';
end $$;
create trigger payment_reviews_append_only before update or delete on public.payment_reviews
  for each row execute function private.keep_payment_reviews_append_only();

create function public.record_payment_review(p_order uuid, p_staff uuid, p_decision text, p_note text)
returns public.payment_reviews language plpgsql security invoker set search_path='' as $$
declare payment public.payment_orders; entry public.payment_reviews;
begin
  if p_staff is null or not exists (select 1 from public.payment_staff where user_id = p_staff) then
    raise exception 'Only payment staff can review held payments.' using errcode = '42501';
  end if;
  select * into payment from public.payment_orders where id = p_order;
  if not found then raise exception 'Booking payment was not found.' using errcode = '22023'; end if;
  -- Only held payments are reviewable, so a decision can never contradict a settled ledger.
  if payment.state not in ('blocked','refund_requested') then
    raise exception 'This payment is not held for review.' using errcode = '22023';
  end if;
  insert into public.payment_reviews(order_id,staff_id,decision,note,order_state,charge_id,transfer_id,refund_id)
    values(p_order,p_staff,p_decision,btrim(p_note),payment.state,payment.charge_id,payment.transfer_id,payment.refund_id)
    returning * into entry;
  return entry;
end $$;
revoke all on function public.record_payment_review(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_payment_review(uuid,uuid,text,text) to service_role;
