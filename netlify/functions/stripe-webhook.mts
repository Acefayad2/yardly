import { services, env, json, orderById, syncCheckout, refundOrder, transition } from "../lib/payments.js";
export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" },405);
  const s=services();
  let event;
  try { event=s.stripe.webhooks.constructEvent(await req.text(),req.headers.get("stripe-signature") ?? "",env("STRIPE_WEBHOOK_SECRET")); }
  catch { return json({ error: "Invalid signature" },400); }
  if (event.livemode) return json({ error: "Sandbox only" },400);
  try {
    if (event.type.startsWith("checkout.session.")) {
      const object=event.data.object as { id: string; client_reference_id?: string | null };
      if (object.client_reference_id) {
        const order=await orderById(s,object.client_reference_id);
        // Events can arrive before the create-session response is persisted. Retry.
        if (order.session_id !== object.id) return json({ error: "Session not linked yet" },503);
        const latest=await syncCheckout(s,order);
        await refundOrder(s,latest);
      }
    } else if (event.type === "charge.dispute.created" || event.type === "charge.refunded") {
      const object=event.data.object as { id: string; charge?: string };
      const chargeId=event.type === "charge.refunded" ? object.id : object.charge;
      const { data,error }=await s.db.from("payment_orders").select("id").eq("charge_id",chargeId).maybeSingle();
      if(error) throw error;
      if(data) await transition(s,data.id,"block");
    }
    return json({ received: true });
  } catch { return json({ error: "Retry event" },503); }
}
