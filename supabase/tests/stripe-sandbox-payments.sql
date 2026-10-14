-- Run only against the isolated sandbox. All fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','host@yardly-test.invalid'),
 ('10000000-0000-4000-8000-000000000002','guest@yardly-test.invalid'),
 ('10000000-0000-4000-8000-000000000003','other@yardly-test.invalid');
insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,description,images,latitude,longitude,neighborhood,status)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Payment test yard','Test city','Backyards',100,1,10,'Isolated payment test fixture only.',array['https://example.com/test.jpg'],38,-77,'Test neighborhood','published');
insert into public.host_stripe_accounts(host_id,account_id,ready)
values('10000000-0000-4000-8000-000000000001','acct_test_fixture',true);
do $$
declare p public.payment_orders; duplicate public.payment_orders; changed public.payment_orders;
begin
  if has_table_privilege('authenticated','public.reservations','INSERT')
    or has_column_privilege('authenticated','public.reservations','status','UPDATE')
    or has_function_privilege('authenticated','public.prepare_payment_order(uuid,uuid,uuid,date,time,time,integer)','EXECUTE')
    or has_table_privilege('authenticated','public.payment_orders','UPDATE') then
    raise exception 'Payment authorization bypass exists';
  end if;
  p:=public.prepare_payment_order('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',current_date+2,'10:00','12:00',2);
  if p.subtotal_cents<>20000 or p.fee_cents<>2400 or p.total_cents<>22400 then raise exception 'Wrong quote'; end if;
  duplicate:=public.prepare_payment_order('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',current_date+2,'10:00','12:00',2);
  if duplicate.id<>p.id then raise exception 'Retry duplicated reservation'; end if;
  if exists(select 1 from public.get_booking_slots('20000000-0000-4000-8000-000000000001',current_date+2) where start_hour=10 and end_hour=12) then
    raise exception 'Pending hold leaked into availability';
  end if;
  begin
    perform public.prepare_payment_order('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',current_date+2,'11:00','13:00',2);
    raise exception 'Overlap accepted';
  exception when exclusion_violation then null; end;
  update public.payment_settings set guest_fee_bps=1500;
  duplicate:=public.prepare_payment_order('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',current_date+2,'10:00','12:00',2);
  if duplicate.fee_cents<>2400 then raise exception 'Old quote changed'; end if;
  changed:=public.prepare_payment_order('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',current_date+3,'10:00','12:00',2);
  if changed.fee_cents<>3000 then raise exception 'New fee not applied'; end if;
  perform public.transition_payment_order(p.id,'paid');
  if (public.transition_payment_order(p.id,'claim_transfer')).id is not null then raise exception 'Early payout allowed'; end if;
  begin
    perform public.transition_payment_order(p.id,'cancel',null,'10000000-0000-4000-8000-000000000003');
    raise exception 'Another user cancelled booking';
  exception when insufficient_privilege then null; end;
  perform public.transition_payment_order(p.id,'cancel',null,'10000000-0000-4000-8000-000000000002');
  perform public.transition_payment_order(p.id,'paid');
  if (select state from public.payment_orders where id=p.id)<>'refund_requested' then raise exception 'Late event undid cancellation'; end if;
  if (public.transition_payment_order(p.id,'claim_transfer')).id is not null then raise exception 'Refund payout allowed'; end if;
  perform public.transition_payment_order(p.id,'refunded','re_test_fixture');
  if (select status from public.reservations where id=p.id)<>'cancelled' then raise exception 'Refund did not cancel'; end if;
  perform public.transition_payment_order(changed.id,'expired');
  if (select status from public.reservations where id=changed.id)<>'cancelled' then raise exception 'Expired checkout held slot'; end if;
end $$;
select 'PASS: fees, immutable quotes, retry deduplication, holds, overlap, permissions, early payout, cancellation and event ordering' as result;
rollback;
