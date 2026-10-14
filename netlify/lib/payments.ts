import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type {} from "@netlify/functions";

export const TEST_PROJECT = "vfwbtfkmzxaehbsbrojx";
export function env(name: string) {
  const value = Netlify.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function services() {
  const key = env("STRIPE_SECRET_KEY");
  const url = env("PAYMENTS_SUPABASE_URL");
  // Fail closed: even an accidental production deploy cannot move real money/data.
  if (!/^rk_test_|^sk_test_/.test(key) || new URL(url).hostname !== `${TEST_PROJECT}.supabase.co`) {
    throw new Error("Sandbox isolation check failed");
  }
  return {
    stripe: new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 }),
    db: createClient(url, env("PAYMENTS_SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}
export type Services = ReturnType<typeof services>;
export type Order = {
  id: string; guest_id: string; host_id: string; account_id: string; request_id: string;
  subtotal_cents: number; fee_cents: number; fee_bps: number; total_cents: number;
  state: string; session_id: string | null; payment_intent_id: string | null;
  charge_id: string | null; transfer_id: string | null; refund_id: string | null;
  created_at: string; operation_started_at: string | null; last_checked_at?: string;
};
export async function userFor(req: Request, db: Services["db"]) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Sign in to continue.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) throw new Error("Verify your email and sign in to continue.");
  return data.user;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function originFor(req: Request) {
  const origin = new URL(env("PAYMENTS_APP_URL")).origin;
  if (req.headers.get("origin") !== origin || new URL(req.url).origin !== origin) throw new Error("Invalid request origin.");
  return origin;
}
export async function orderById(s: Services, id: string): Promise<Order> {
  const { data, error } = await s.db.from("payment_orders").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Booking payment was not found.");
  return data;
}
export async function transition(s: Services, id: string, action: string, value: string | null = null, actor: string | null = null): Promise<Order | null> {
  const { data, error } = await s.db.rpc("transition_payment_order", { p_id: id, p_action: action, p_value: value, p_actor: actor });
  if (error) throw error;
  return data;
}
export async function save(s: Services, id: string, values: Partial<Order>) {
  const { error } = await s.db.from("payment_orders").update(values).eq("id", id);
  if (error) throw error;
}
export function assertPayment(session: Stripe.Checkout.Session, order: Order) {
  if (session.livemode || session.client_reference_id !== order.id || session.currency !== "usd" || session.amount_total !== order.total_cents) {
    throw new Error("Payment does not match booking.");
  }
}
export async function syncCheckout(s: Services, order: Order) {
  if (!order.session_id) return order;
  const session = await s.stripe.checkout.sessions.retrieve(order.session_id, { expand: ["payment_intent.latest_charge"] });
  assertPayment(session, order);
  if (session.payment_status === "paid") {
    const intent = session.payment_intent as Stripe.PaymentIntent;
    const charge = intent.latest_charge as Stripe.Charge;
    if (!intent || intent.status !== "succeeded" || !charge || charge.livemode || !charge.paid) throw new Error("Payment not settled.");
    await save(s, order.id, { payment_intent_id: intent.id, charge_id: charge.id });
    if (charge.disputed || charge.amount_refunded > 0) {
      await transition(s, order.id, "block");
    } else {
      await transition(s, order.id, "paid");
    }
  } else if (session.status === "expired") {
    await transition(s, order.id, "expired");
  }
  return orderById(s, order.id);
}
export async function refundOrder(s: Services, order: Order) {
  if (order.state !== "refund_requested" || !order.payment_intent_id) return;
  // A lost response must never create a second refund after Stripe's key-retention window.
  const refunds = await s.stripe.refunds.list({ payment_intent: order.payment_intent_id, limit: 100 });
  let refund = refunds.data.find((r) => r.metadata?.yardly_order === order.id);
  if (!refund && refunds.data.length) { await transition(s, order.id, "block"); return; }
  if (!refund) refund = await s.stripe.refunds.create({ payment_intent: order.payment_intent_id,
    amount: order.total_cents, metadata: { yardly_order: order.id } }, { idempotencyKey: `refund:${order.id}` });
  // Metadata alone is not evidence of a full refund: support may have issued
  // a partial refund, or a retry may return an unexpected payment object.
  const intentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  if (refund.amount !== order.total_cents || refund.currency !== "usd" || intentId !== order.payment_intent_id
    || !order.charge_id || chargeId !== order.charge_id || refund.metadata?.yardly_order !== order.id) {
    await transition(s, order.id, "block"); return;
  }
  if (refund.status === "succeeded") await transition(s, order.id, "refunded", refund.id);
  else if (refund.status === "failed" || refund.status === "canceled") await transition(s, order.id, "block");
}
export async function cancelOrder(s: Services, id: string, actor: string) {
  const order = await transition(s, id, "cancel", null, actor);
  if (order?.id !== id) throw new Error("Cancellation was not confirmed.");
  await refundOrder(s, order);
  return orderById(s, id);
}
export async function accountReady(s: Services, accountId: string) {
  const account = await s.stripe.v2.core.accounts.retrieve(accountId, { include: ["configuration.recipient"] });
  return !account.livemode && account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
}
export async function releaseOrder(s: Services, order: Order) {
  if (!order.charge_id || !["paid", "releasing"].includes(order.state)) return;
  // Reconcile before retrying, including after the idempotency cache expires.
  const transfers = await s.stripe.transfers.list({ transfer_group: order.id, limit: 100 });
  const prior = transfers.data.find((t) => t.metadata.yardly_order === order.id);
  if (prior) {
    if (order.state !== "releasing" || prior.destination !== order.account_id || prior.amount !== order.subtotal_cents || prior.reversed) {
      await transition(s, order.id, "block"); return;
    }
    await transition(s, order.id, "transferred", prior.id); return;
  }
  // Uncertain operations older than 23h require reconciliation, never a fresh transfer.
  if (order.state === "releasing" && order.operation_started_at && Date.now() - Date.parse(order.operation_started_at) > 23 * 3600000) {
    await transition(s, order.id, "block"); return;
  }
  const charge = await s.stripe.charges.retrieve(order.charge_id, { expand: ["balance_transaction"] });
  const refunds = await s.stripe.refunds.list({ charge: charge.id, limit: 1 });
  if (charge.livemode || !charge.paid || charge.disputed || charge.amount_refunded || refunds.data.length || charge.amount !== order.total_cents || charge.currency !== "usd" || charge.metadata.yardly_order !== order.id) {
    await transition(s, order.id, "block"); return;
  }
  const balance = charge.balance_transaction as Stripe.BalanceTransaction | null;
  if (!balance || balance.status !== "available" || !(await accountReady(s, order.account_id))) return;
  const claimed = order.state === "releasing" ? order : await transition(s, order.id, "claim_transfer");
  // A null PostgreSQL composite can arrive as an object with null fields.
  // Only the exact successful database claim authorizes a transfer.
  if (claimed?.id !== order.id || claimed.state !== "releasing") return;
  const transfer = await s.stripe.transfers.create({ amount: order.subtotal_cents, currency: "usd",
    destination: order.account_id, source_transaction: charge.id, transfer_group: order.id,
    metadata: { yardly_order: order.id } }, { idempotencyKey: `transfer:${order.id}` });
  await transition(s, order.id, "transferred", transfer.id);
}
