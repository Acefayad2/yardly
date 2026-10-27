import { services, userFor, json, orderById, syncCheckout } from "../lib/payments.js";
export default async function handler(req: Request) {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const s = services(); const user = await userFor(req,s.db);
    const order = await orderById(s,new URL(req.url).searchParams.get("id") ?? "");
    if (order.guest_id !== user.id && order.host_id !== user.id) return json({ error: "Not found" },404);
    const latest = await syncCheckout(s,order);
    return json({ id: latest.id, state: latest.state, totalCents: latest.total_cents, sandbox: true });
  } catch { return json({ error: "Could not verify payment. Do not pay again; refresh to check." },503); }
}
