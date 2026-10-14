import { services, originFor, userFor, json, accountReady } from "../lib/payments.js";
export default async function handler(req: Request) {
  if (!["GET","POST"].includes(req.method)) return json({ error: "Method not allowed" },405);
  try {
    const s=services(); const user=await userFor(req,s.db);
    const { data: stored,error }=await s.db.from("host_stripe_accounts").select("*").eq("host_id",user.id).maybeSingle();
    if(error) throw error;
    let accountId: string | undefined=stored?.account_id;
    if(req.method === "GET") {
      const ready=accountId ? await accountReady(s,accountId) : false;
      if(accountId) {
        const {error:updateError}=await s.db.from("host_stripe_accounts").update({ready}).eq("host_id",user.id);
        if(updateError) throw updateError;
      }
      const {data: orders,error:ordersError}=await s.db.from("payment_orders").select("id,state,subtotal_cents").eq("host_id",user.id);
      if(ordersError) throw ordersError;
      return json({ready, sandbox:true, orders});
    }
    const origin=originFor(req);
    if(!accountId) {
      const account=await s.stripe.v2.core.accounts.create({ contact_email:user.email, dashboard:"express",
        identity:{country:"us"},
        defaults:{responsibilities:{fees_collector:"application",losses_collector:"application"}},
        configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
        metadata:{yardly_host:user.id},
      },{idempotencyKey:`host:${user.id}`});
      accountId=account.id;
      const {error:insertError}=await s.db.from("host_stripe_accounts").upsert({host_id:user.id,account_id:accountId},{onConflict:"host_id"});
      if(insertError) throw insertError;
    }
    const link=await s.stripe.v2.core.accountLinks.create({account:accountId,
      use_case:{type:"account_onboarding",account_onboarding:{refresh_url:`${origin}/host/dashboard/?payments=refresh`,return_url:`${origin}/host/dashboard/?payments=return`}}});
    return json({url:link.url});
  } catch { return json({error:"Payment setup could not be loaded. Please retry; your listing has not been changed."},503); }
}
