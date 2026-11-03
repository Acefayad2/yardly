"use client";
import { useCallback, useEffect, useState } from "react";
import { paymentRequest } from "@/lib/payments";

type Held = { id:string; state:string; subtotal_cents:number; fee_cents:number; total_cents:number;
  charge_id:string|null; transfer_id:string|null; refund_id:string|null; created_at:string };
type Review = { id:number; order_id:string; staff_id:string; decision:string; note:string;
  order_state:string; created_at:string };
type Queue = { staff:boolean; orders:Held[]; reviews:Review[] };

const DECISIONS: { value:string; label:string }[] = [
  { value:"noted", label:"Reviewed, still deciding" },
  { value:"refund_guest", label:"Refund the guest in Stripe" },
  { value:"release_host", label:"Release the host payout in Stripe" },
  { value:"no_action", label:"No action needed" },
];
const money = (cents:number) => `$${(cents/100).toFixed(2)}`;

export default function StaffPaymentReview() {
  const [queue,setQueue]=useState<Queue|null>(null);
  const [error,setError]=useState("");
  const [denied,setDenied]=useState(false);
  const [open,setOpen]=useState("");
  const [decision,setDecision]=useState("noted");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);

  const fail=useCallback((e:unknown)=>{
    const message=e instanceof Error ? e.message : "Could not load the review queue.";
    setDenied(/payment staff/.test(message)); setError(message);
  },[]);
  const load=useCallback(async()=>{
    try{ setQueue(await paymentRequest("staff-payments")); setError(""); setDenied(false); }
    catch(e){ fail(e); }
  },[fail]);
  useEffect(()=>{ void paymentRequest("staff-payments").then(queue=>{ setQueue(queue); setDenied(false); }).catch(fail); },[fail]);

  async function submit(id:string) {
    setBusy(true); setError("");
    try{ await paymentRequest("staff-payments",{ id,decision,note }); setNote(""); setOpen(""); await load(); }
    catch(e){ setError(e instanceof Error ? e.message : "The review could not be recorded."); }
    finally{ setBusy(false); }
  }

  if(denied) return <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
    This queue is limited to Yardly payment staff. Ask the account owner to add your account before reviewing refunds or disputes.</p>;

  return <div className="space-y-6">
    <section className="rounded-2xl border border-border-soft bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Held payments</h2>
      <p className="mt-2 text-sm text-muted">Refunds and disputes stop here instead of recovering automatically. Recording a decision does not move money — carry it out in Stripe, then record what you did.</p>
      <button onClick={()=>void load()} className="mt-4 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Refresh queue</button>
    </section>

    {error && !denied && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {!queue && !error && <p role="status" className="text-sm text-muted">Loading held payments…</p>}
    {queue && !queue.orders.length && <p className="rounded-2xl border border-border-soft bg-white p-6 text-sm text-muted">No payments are waiting for review.</p>}

    {queue?.orders.map(order=>{
      const history=queue.reviews.filter(review=>review.order_id === order.id);
      return <section key={order.id} className="rounded-2xl border border-border-soft bg-white p-5 sm:p-6" aria-label={`Held payment ${order.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{money(order.total_cents)} total · {money(order.subtotal_cents)} host · {money(order.fee_cents)} fee</p>
            <p className="mt-1 text-sm text-muted">Booking {order.id} · held as {order.state.replace("_"," ")} · opened {new Date(order.created_at).toLocaleString()}</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            {order.transfer_id ? "After host transfer" : "Before host transfer"}
          </span>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Charge</dt><dd className="font-mono text-xs break-all">{order.charge_id ?? "none"}</dd></div>
          <div><dt className="text-muted">Transfer</dt><dd className="font-mono text-xs break-all">{order.transfer_id ?? "none"}</dd></div>
          <div><dt className="text-muted">Refund</dt><dd className="font-mono text-xs break-all">{order.refund_id ?? "none"}</dd></div>
        </dl>

        {history.length > 0 && <ol className="mt-5 space-y-3 border-t border-border-soft pt-4">
          {history.map(review=><li key={review.id} className="text-sm">
            <p className="font-semibold">{DECISIONS.find(item=>item.value === review.decision)?.label ?? review.decision}</p>
            <p className="mt-1 text-muted">{review.note}</p>
            <p className="mt-1 text-xs text-muted">{new Date(review.created_at).toLocaleString()} · held as {review.order_state.replace("_"," ")}</p>
          </li>)}
        </ol>}

        {open === order.id ? <form className="mt-5 space-y-3 border-t border-border-soft pt-4" onSubmit={event=>{ event.preventDefault(); void submit(order.id); }}>
          <label className="block text-sm font-semibold" htmlFor={`decision-${order.id}`}>Decision</label>
          <select id={`decision-${order.id}`} value={decision} onChange={event=>setDecision(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm">
            {DECISIONS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <label className="block text-sm font-semibold" htmlFor={`note-${order.id}`}>What you found and did</label>
          <textarea id={`note-${order.id}`} required maxLength={1000} rows={3} value={note} onChange={event=>setNote(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm" />
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Recording…" : "Record decision"}</button>
            <button type="button" onClick={()=>{ setOpen(""); setNote(""); }} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button>
          </div>
        </form> : <button onClick={()=>{ setOpen(order.id); setDecision("noted"); setNote(""); }}
          className="mt-5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Record a decision</button>}
      </section>;
    })}
  </div>;
}
