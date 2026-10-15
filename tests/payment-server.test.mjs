import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { assertPayment, services, TEST_PROJECT, releaseOrder, refundOrder, cancelOrder } from "../netlify/lib/payments.ts";

const order = {id:"order-1",guest_id:"guest",host_id:"host",account_id:"acct_host",subtotal_cents:10000,fee_cents:1200,total_cents:11200,state:"paid",charge_id:"ch_1",payment_intent_id:"pi_1",operation_started_at:null};
function fixture(options={}) {
  const calls=[];
  const s={db:{rpc:async(name,args)=>{calls.push(args);return {data: options.claim ?? (options.eligible === false ? null : {...order,state:"releasing"}),error:null};}},stripe:{
    transfers:{list:async()=>({data:options.transfers ?? []}),create:async(params,opts)=>{calls.push({transfer:params,key:opts.idempotencyKey});return {id:"tr_1"};}},
    charges:{retrieve:async()=>({id:"ch_1",paid:true,livemode:false,amount:11200,currency:"usd",metadata:{yardly_order:"order-1"},amount_refunded:0,disputed:false,balance_transaction:{status:"available"},...options.charge})},
    refunds:{list:async()=>({data:options.refunds ?? []}),create:async(params,opts)=>{calls.push({refund:params,key:opts.idempotencyKey});return {id:"re_1",status:"succeeded",amount:params.amount,currency:"usd",payment_intent:params.payment_intent,charge:"ch_1",metadata:params.metadata,...options.createdRefund};}},
    v2:{core:{accounts:{retrieve:async()=>({livemode:false,configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:options.ready === false ? "inactive" : "active"}}}}}})}}},
  }};
  return {s,calls};
}
test("sandbox rejects live key and production database",()=>{
  globalThis.Netlify={env:{get:name=>({STRIPE_SECRET_KEY:"sk_live_not_a_real_key",PAYMENTS_SUPABASE_URL:`https://${TEST_PROJECT}.supabase.co`,PAYMENTS_SUPABASE_SECRET_KEY:"test"}[name])}};
  assert.throws(()=>services(),/isolation/);
  globalThis.Netlify.env.get=name=>({STRIPE_SECRET_KEY:"rk_test_not_a_real_key",PAYMENTS_SUPABASE_URL:"https://obgbriewuvobgehndxzk.supabase.co",PAYMENTS_SUPABASE_SECRET_KEY:"test"}[name]);
  assert.throws(()=>services(),/isolation/);
});
test("checkout amount, currency, order and environment must match",()=>{
  const session={livemode:false,client_reference_id:order.id,currency:"usd",amount_total:11200};
  assert.doesNotThrow(()=>assertPayment(session,order));
  for(const change of [{livemode:true},{amount_total:100},{currency:"eur"},{client_reference_id:"other"}]) assert.throws(()=>assertPayment({...session,...change},order));
});
test("payout waits for database end-time claim",async()=>{
  const {s,calls}=fixture({eligible:false});await releaseOrder(s,order);
  assert.equal(calls.filter(c=>c.transfer).length,0);
});
test("payout rejects null composite, empty and mismatched database claims",async()=>{
  for(const claim of [{id:null,state:null},{},{...order,state:"paid"},{...order,id:"other",state:"releasing"}]) {
    const {s,calls}=fixture({claim});await releaseOrder(s,order);
    assert.equal(calls.filter(c=>c.transfer).length,0);
  }
});
test("existing transfer without a matching release claim is blocked for review",async()=>{
  const {s,calls}=fixture({transfers:[{id:"tr_old",destination:"acct_host",amount:10000,reversed:false,metadata:{yardly_order:"order-1"}}]});
  await releaseOrder(s,order);
  assert.equal(calls.length,1);assert.equal(calls[0].p_action,"block");
});
for(const charge of [{disputed:true},{amount_refunded:1},{livemode:true},{amount:1},{metadata:{yardly_order:"other"}}]) test(`unsafe charge blocks transfer ${JSON.stringify(charge)}`,async()=>{
  const {s,calls}=fixture({charge});await releaseOrder(s,order);
  assert.equal(calls.filter(c=>c.transfer).length,0);assert.equal(calls[0].p_action,"block");
});
test("unsettled funds and inactive host wait",async()=>{
  for(const opts of [{ready:false},{charge:{balance_transaction:{status:"pending"}}}]) {
    const {s,calls}=fixture(opts);await releaseOrder(s,order);assert.equal(calls.length,0);
  }
});
test("successful payout transfers only subtotal with stable idempotency key",async()=>{
  const {s,calls}=fixture();await releaseOrder(s,order);
  assert.equal(calls[0].p_action,"claim_transfer");
  assert.equal(calls[1].transfer.amount,10000);assert.equal(calls[1].key,"transfer:order-1");
  assert.equal(calls[2].p_action,"transferred");
});
test("a previously created transfer is reconciled without creating another",async()=>{
  const {s,calls}=fixture({transfers:[{id:"tr_old",destination:"acct_host",amount:10000,reversed:false,metadata:{yardly_order:"order-1"}}]});
  await releaseOrder(s,{...order,state:"releasing"});assert.equal(calls.length,1);assert.equal(calls[0].p_value,"tr_old");
});
test("uncertain stale payout is blocked, not reissued",async()=>{
  const {s,calls}=fixture();await releaseOrder(s,{...order,state:"releasing",operation_started_at:new Date(Date.now()-25*3600000).toISOString()});
  assert.equal(calls.length,1);assert.equal(calls[0].p_action,"block");
});
test("partially reversed transfer is blocked rather than reported fully transferred",async()=>{
  const {s,calls}=fixture({transfers:[{id:"tr_partial",destination:"acct_host",amount:10000,reversed:false,amount_reversed:1,metadata:{yardly_order:"order-1"}}]});
  await releaseOrder(s,{...order,state:"releasing"});
  assert.equal(calls.length,1);assert.equal(calls[0].p_action,"block");
});
test("refund is full guest total, not just host subtotal",async()=>{
  const {s,calls}=fixture();await refundOrder(s,{...order,state:"refund_requested"});
  assert.equal(calls[0].refund.amount,11200);assert.equal(calls[0].key,"refund:order-1");assert.equal(calls[1].p_action,"refunded");
});
test("existing refund is reconciled without duplicate refund",async()=>{
  const {s,calls}=fixture({refunds:[{id:"re_old",status:"succeeded",amount:11200,currency:"usd",payment_intent:"pi_1",charge:"ch_1",metadata:{yardly_order:"order-1"}}]});
  await refundOrder(s,{...order,state:"refund_requested"});assert.equal(calls.length,1);assert.equal(calls[0].p_value,"re_old");
});
test("partial or mismatched existing refund is blocked, never reported fully refunded",async()=>{
  const refund={id:"re_old",status:"succeeded",amount:11200,currency:"usd",payment_intent:"pi_1",charge:"ch_1",metadata:{yardly_order:"order-1"}};
  for(const change of [{amount:100},{currency:"eur"},{payment_intent:"pi_other"},{charge:"ch_other"}]) {
    const {s,calls}=fixture({refunds:[{...refund,...change}]});
    await refundOrder(s,{...order,state:"refund_requested"});
    assert.equal(calls.length,1);assert.equal(calls[0].p_action,"block");
  }
});
test("new refund response is validated before recording success",async()=>{
  const {s,calls}=fixture({createdRefund:{amount:100}});
  await refundOrder(s,{...order,state:"refund_requested"});
  assert.equal(calls[0].key,"refund:order-1");assert.equal(calls[1].p_action,"block");
});
test("pending refunds wait and failed refunds block without duplicate creation",async()=>{
  for(const status of ["pending","requires_action","failed","canceled"]) {
    const {s,calls}=fixture({refunds:[{id:"re_old",status,amount:11200,currency:"usd",payment_intent:"pi_1",charge:"ch_1",metadata:{yardly_order:"order-1"}}]});
    await refundOrder(s,{...order,state:"refund_requested"});
    if(["failed","canceled"].includes(status)) {assert.equal(calls.length,1);assert.equal(calls[0].p_action,"block");}
    else assert.equal(calls.length,0);
  }
});
test("expanded refund payment references reconcile successfully",async()=>{
  const {s,calls}=fixture({refunds:[{id:"re_old",status:"succeeded",amount:11200,currency:"usd",payment_intent:{id:"pi_1"},charge:{id:"ch_1"},metadata:{yardly_order:"order-1"}}]});
  await refundOrder(s,{...order,state:"refund_requested"});
  assert.equal(calls.length,1);assert.equal(calls[0].p_action,"refunded");
});
test("cancellation reports persisted refund state and forwards the authorized actor",async()=>{
  for(const state of ["refunded","refund_requested","blocked"]) {
    const {s,calls}=fixture({claim:{...order,state:"refund_requested"}});
    s.db.from=()=>({select:()=>({eq:()=>({single:async()=>({data:{...order,state},error:null})})})});
    const result=await cancelOrder(s,order.id,"guest");
    assert.equal(result.state,state);
    assert.equal(calls[0].p_action,"cancel");assert.equal(calls[0].p_actor,"guest");
  }
});
test("already refunded cancellation does not create another Stripe refund",async()=>{
  const {s,calls}=fixture({claim:{...order,state:"refunded"}});
  s.db.from=()=>({select:()=>({eq:()=>({single:async()=>({data:{...order,state:"refunded"},error:null})})})});
  assert.equal((await cancelOrder(s,order.id,"guest")).state,"refunded");
  assert.equal(calls.length,1);
});
test("unconfirmed cancellation fails without refunding",async()=>{
  const {s,calls}=fixture({claim:{id:null,state:null}});
  await assert.rejects(cancelOrder(s,order.id,"guest"),/not confirmed/);
  assert.equal(calls.length,1);
});
test("Stripe rejects forged or altered webhook payloads",()=>{
  const stripe=new Stripe("sk_test_fixture");const payload=JSON.stringify({id:"evt_test",livemode:false,type:"checkout.session.completed"});const secret="whsec_test_fixture";
  const header=stripe.webhooks.generateTestHeaderString({payload,secret});
  assert.equal(stripe.webhooks.constructEvent(payload,header,secret).id,"evt_test");
  assert.throws(()=>stripe.webhooks.constructEvent(payload+" ",header,secret));
  assert.throws(()=>stripe.webhooks.constructEvent(payload,"forged",secret));
});
