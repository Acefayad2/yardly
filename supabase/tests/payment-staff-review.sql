-- Run only against the isolated sandbox. All fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','staff-host@yardly-test.invalid'),
 ('11000000-0000-4000-8000-000000000002','staff-guest@yardly-test.invalid'),
 ('11000000-0000-4000-8000-000000000003','tim-staff@yardly-test.invalid'),
 ('11000000-0000-4000-8000-000000000004','outsider@yardly-test.invalid');
insert into public.listings(id,host_id,title,location,space_type,hourly_price,min_hours,capacity,description,images,latitude,longitude,neighborhood,status)
values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Review test yard','Test city','Backyards',100,1,10,'Isolated review test fixture only.',array['https://example.com/test.jpg'],38,-77,'Test neighborhood','published');
insert into public.host_stripe_accounts(host_id,account_id,ready)
values('11000000-0000-4000-8000-000000000001','acct_review_fixture',true);
insert into public.payment_staff(user_id,note) values('11000000-0000-4000-8000-000000000003','Refund and dispute review');
do $$
declare p public.payment_orders; entry public.payment_reviews;
begin
  if has_table_privilege('authenticated','public.payment_reviews','SELECT')
    or has_table_privilege('authenticated','public.payment_reviews','INSERT')
    or has_table_privilege('authenticated','public.payment_staff','INSERT')
    or has_table_privilege('authenticated','public.payment_staff','UPDATE')
    or has_function_privilege('authenticated','public.record_payment_review(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'Review authorization bypass exists';
  end if;
  p:=public.prepare_payment_order('11000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',current_date+2,'10:00','12:00',2);

  -- A payment that is not held cannot be reviewed.
  begin
    perform public.record_payment_review(p.id,'11000000-0000-4000-8000-000000000003','noted','Pending order must not be reviewable.');
    raise exception 'Pending payment accepted a review';
  exception when sqlstate '22023' then null; end;

  perform public.transition_payment_order(p.id,'paid');
  perform public.transition_payment_order(p.id,'block');

  -- Non-staff are refused even with a valid held payment.
  begin
    perform public.record_payment_review(p.id,'11000000-0000-4000-8000-000000000004','noted','Outsider must not review.');
    raise exception 'Non-staff recorded a review';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.record_payment_review(p.id,null,'noted','Missing staff must not review.');
    raise exception 'Null staff recorded a review';
  exception when sqlstate '42501' then null; end;

  -- An unknown booking is refused before anything is written.
  begin
    perform public.record_payment_review('41000000-0000-4000-8000-00000000000f','11000000-0000-4000-8000-000000000003','noted','Unknown order.');
    raise exception 'Unknown payment accepted a review';
  exception when sqlstate '22023' then null; end;

  entry:=public.record_payment_review(p.id,'11000000-0000-4000-8000-000000000003','refund_guest','Dispute opened before transfer; refunding in Stripe.');
  if entry.order_state<>'blocked' or entry.staff_id<>'11000000-0000-4000-8000-000000000003' then
    raise exception 'Review did not capture the held state';
  end if;
  if (select count(*) from public.payment_reviews where order_id=p.id)<>1 then raise exception 'Review was not recorded once'; end if;

  -- Invalid decisions and empty notes are rejected by the contract.
  begin
    perform public.record_payment_review(p.id,'11000000-0000-4000-8000-000000000003','transfer_now','Unsupported decision.');
    raise exception 'Unsupported decision accepted';
  exception when check_violation then null; end;
  begin
    perform public.record_payment_review(p.id,'11000000-0000-4000-8000-000000000003','noted','   ');
    raise exception 'Empty note accepted';
  exception when check_violation then null; end;

  -- The trail is append-only, including for the backend role.
  begin
    update public.payment_reviews set note='rewritten' where id=entry.id;
    raise exception 'Review history was rewritten';
  exception when sqlstate '42501' then null; end;
  begin
    delete from public.payment_reviews where id=entry.id;
    raise exception 'Review history was deleted';
  exception when sqlstate '42501' then null; end;

  -- Reviewing does not move the ledger; only Stripe events do.
  if (select state from public.payment_orders where id=p.id)<>'blocked' then raise exception 'Review changed the ledger'; end if;
end $$;
-- Exercise actual invoker-rights backend permissions, not only postgres ownership.
set local role service_role;
select public.record_payment_review(id,'11000000-0000-4000-8000-000000000003','no_action','Service role review path.')
  from public.payment_orders where request_id='31000000-0000-4000-8000-000000000001';
reset role;
select 'PASS: staff gating, held-state limits, decision/note contract, append-only history and ledger safety' as result;
rollback;
