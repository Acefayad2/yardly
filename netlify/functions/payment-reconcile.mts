import { services, syncCheckout, refundOrder, releaseOrder, save, transition, type Order } from "../lib/payments.js";
export default async function handler() {
  const s=services();
  const { data,error }=await s.db.from("payment_orders").select("*")
    .in("state",["pending","paid","refund_requested","releasing"]).order("last_checked_at").limit(10);
  if(error) throw error;
  for(const order of (data ?? []) as Order[]) {
    try {
      if(order.state === "pending" && !order.session_id && Date.now()-Date.parse(order.created_at)>40*60000) {
        // No checkout URL is returned until its ID is persisted, so this cannot
        // abandon a checkout that was handed to a customer.
        await transition(s,order.id,"expired");
      } else {
        const latest=order.state === "pending" ? await syncCheckout(s,order) : order;
        await refundOrder(s,latest);
        await releaseOrder(s,latest);
      }
    } catch { console.error("Payment reconciliation needs retry",order.id); }
    finally { await save(s,order.id,{last_checked_at:new Date().toISOString()}); }
  }
}
// Every 5 minutes UTC. Netlify does not schedule previews: invoke manually during QA.
export const config = { schedule: "*/5 * * * *" };
