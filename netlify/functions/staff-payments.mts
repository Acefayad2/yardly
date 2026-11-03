import { services, userFor, json, isPaymentStaff, heldOrders, reviewsFor, recordReview, originFor } from "../lib/payments.js";
export default async function handler(req: Request) {
  if (!["GET","POST"].includes(req.method)) return json({ error: "Method not allowed" },405);
  let stage = "configuration";
  try {
    const s=services();
    stage = "authentication";
    const user=await userFor(req,s.db);
    stage = "staff-check";
    if(!await isPaymentStaff(s,user.id)) return json({ staff:false, error:"This review queue is limited to Yardly payment staff." },403);
    if(req.method === "GET") {
      stage = "review-queue";
      const orders=await heldOrders(s);
      const reviews=await reviewsFor(s,orders.map(order=>order.id as string));
      return json({ staff:true, sandbox:true, orders, reviews });
    }
    originFor(req);
    stage = "review-record";
    const { id,decision,note }=await req.json();
    const review=await recordReview(s,id,user.id,decision,note);
    return json({ staff:true, review });
  } catch (error) {
    const diagnostic = error as { code?: string; status?: number; statusCode?: number; message?: string };
    // Codes only: never log note text, credentials or Stripe response bodies.
    console.error("staff-payments", { stage, code: diagnostic.code, status: diagnostic.status ?? diagnostic.statusCode });
    if(stage === "review-record") {
      // Only Yardly's own authored validation messages are echoed back.
      const expected=typeof diagnostic.message === "string" && /review decisions|review note|was not found|not held for review|payment staff/.test(diagnostic.message);
      return json({ error: expected ? diagnostic.message : "The review could not be recorded. Nothing was changed; refresh the queue and try again." },expected ? 400 : 503);
    }
    return json({ error:"The review queue could not be loaded. No payment was changed." },503);
  }
}
