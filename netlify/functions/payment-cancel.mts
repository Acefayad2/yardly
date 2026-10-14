import { services, originFor, userFor, json, cancelOrder } from "../lib/payments.js";
export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" },405);
  try {
    originFor(req); const s=services(); const user=await userFor(req,s.db);
    const { id }=await req.json();
    const order=await cancelOrder(s,id,user.id);
    return json({ state: order.state });
  } catch { return json({ error: "Cancellation could not be completed. Refresh payment status or contact support; do not submit another payment." },409); }
}
