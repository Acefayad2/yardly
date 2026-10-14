import { services, originFor, userFor, json, save, syncCheckout, type Order } from "../lib/payments.js";

export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const origin = originFor(req);
    const s = services();
    const user = await userFor(req, s.db);
    const body = await req.json();
    const { data, error } = await s.db.rpc("prepare_payment_order", { p_guest: user.id,
      p_request: body.requestId, p_listing: body.spaceId, p_date: body.date,
      p_start: body.startTime, p_end: body.endTime, p_guests: body.guests });
    if (error) return json({ error: "That booking cannot be held. Check the host’s payment setup, availability and guest count." }, 409);
    const order: Order = data;
    if (order.session_id) {
      const latest = await syncCheckout(s, order);
      if (latest.state !== "pending") return json({ id: order.id, state: latest.state });
      const session = await s.stripe.checkout.sessions.retrieve(order.session_id);
      return json({ id: order.id, url: session.url });
    }
    if (Date.now() - Date.parse(order.created_at) > 20 * 60000) return json({ error: "Checkout needs support review. Please do not retry payment." }, 409);
    const expires = Math.floor(Date.parse(order.created_at) / 1000) + 35 * 60;
    const session = await s.stripe.checkout.sessions.create({ mode: "payment", allowed_payment_method_types: ["card"],
      client_reference_id: order.id, customer_email: user.email,
      expires_at: expires,
      line_items: [{ price_data: { currency: "usd", unit_amount: order.subtotal_cents, product_data: { name: "Yardly hourly reservation (sandbox)" } }, quantity: 1 },
        ...(order.fee_cents ? [{ price_data: { currency: "usd", unit_amount: order.fee_cents, product_data: { name: "Yardly guest service fee" } }, quantity: 1 }] : [])],
      payment_intent_data: { transfer_group: order.id, metadata: { yardly_order: order.id } },
      metadata: { yardly_order: order.id },
      success_url: `${origin}/bookings/?payment=${order.id}`,
      cancel_url: `${origin}/bookings/?payment=${order.id}&checkout=cancelled`,
    }, { idempotencyKey: `checkout:${order.id}` });
    await save(s, order.id, { session_id: session.id });
    return json({ id: order.id, url: session.url });
  } catch {
    return json({ error: "Checkout is unavailable. No booking has been confirmed. Retry with the same booking details." }, 503);
  }
}
