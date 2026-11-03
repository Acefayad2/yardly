import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaymentStaff, heldOrders, recordReview, REVIEW_DECISIONS, REVIEW_STATES } from "../netlify/lib/payments.ts";

const ORDER = "4f10d5e2-c49f-43c3-886c-a6baa05c8e75";
function fixture(options = {}) {
  const calls = [];
  const builder = result => {
    const chain = {
      select: () => chain, eq: () => chain, in: (...args) => { calls.push({ in: args }); return chain; },
      order: () => chain, limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  };
  const s = {
    db: {
      from: table => { calls.push({ table }); return builder(options[table] ?? { data: null, error: null }); },
      rpc: async (name, args) => { calls.push({ rpc: name, args }); return options.rpc ?? { data: { id: 1, ...args }, error: null }; },
    },
  };
  return { s, calls };
}

test("staff membership is read from the roster, not claimed by the client", async () => {
  const absent = fixture({ payment_staff: { data: null, error: null } });
  assert.equal(await isPaymentStaff(absent.s, "user-1"), false);
  const present = fixture({ payment_staff: { data: { user_id: "user-1" }, error: null } });
  assert.equal(await isPaymentStaff(present.s, "user-1"), true);
  const broken = fixture({ payment_staff: { data: null, error: new Error("database down") } });
  await assert.rejects(() => isPaymentStaff(broken.s, "user-1"), /database down/);
});

test("the queue asks only for payments that are actually held", async () => {
  const { s, calls } = fixture({ payment_orders: { data: [{ id: ORDER, state: "blocked" }], error: null } });
  const orders = await heldOrders(s);
  assert.equal(orders.length, 1);
  assert.deepEqual(calls.find(call => call.in).in[1], [...REVIEW_STATES]);
  assert.deepEqual([...REVIEW_STATES], ["blocked", "refund_requested"]);
});

test("only the listed decisions and a real note are accepted", async () => {
  const { s } = fixture();
  for (const decision of REVIEW_DECISIONS) {
    assert.ok(await recordReview(s, ORDER, "staff-1", decision, "Checked the dispute in Stripe."));
  }
  await assert.rejects(() => recordReview(s, ORDER, "staff-1", "transfer_now", "Not a listed decision."), /listed review decisions/);
  await assert.rejects(() => recordReview(s, ORDER, "staff-1", "noted", "   "), /review note/);
  await assert.rejects(() => recordReview(s, ORDER, "staff-1", "noted", "x".repeat(1001)), /review note/);
  await assert.rejects(() => recordReview(s, ORDER, "staff-1", "noted", 42), /review note/);
  await assert.rejects(() => recordReview(s, "not-an-order", "staff-1", "noted", "Bad identifier."), /was not found/);
});

test("a review is recorded through the gated function with the signed-in staff identity", async () => {
  const { s, calls } = fixture();
  await recordReview(s, ORDER, "staff-1", "refund_guest", "  Refunded in Stripe after the dispute.  ");
  const call = calls.find(entry => entry.rpc);
  assert.equal(call.rpc, "record_payment_review");
  assert.deepEqual(call.args, { p_order: ORDER, p_staff: "staff-1", p_decision: "refund_guest", p_note: "Refunded in Stripe after the dispute." });
  assert.equal(calls.some(entry => entry.table === "payment_orders"), false, "recording must not write the ledger directly");
});

test("a refused review surfaces the database error instead of reporting success", async () => {
  const { s } = fixture({ rpc: { data: null, error: new Error("Only payment staff can review held payments.") } });
  await assert.rejects(() => recordReview(s, ORDER, "outsider", "noted", "Should be refused."), /payment staff/);
});
