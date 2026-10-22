"use client";
import { useCallback, useEffect, useState } from "react";
import { paymentRequest, stripeRedirect } from "@/lib/payments";

type Summary={ready:boolean;orders:{id:string;state:string;subtotal_cents:number}[]};
export default function HostPayments() {
  const [summary,setSummary]=useState<Summary|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{setSummary(await paymentRequest("host-payments"));setError("");}
    catch(e){setError(e instanceof Error ? e.message : "Could not load payments.");}
  },[]);
  useEffect(()=>{void paymentRequest("host-payments").then(setSummary).catch(e=>setError(e instanceof Error ? e.message : "Could not load payments."));},[]);
  async function setup(){
    setBusy(true);setError("");
    try{const result=await paymentRequest("host-payments",{});if(await stripeRedirect(result.url)) await load();}
    catch(e){setError(e instanceof Error ? e.message : "Could not open Stripe.");}
    finally{setBusy(false);}
  }
  const transferred=summary?.orders.filter(o=>o.state === "transferred").reduce((sum,o)=>sum+o.subtotal_cents,0) ?? 0;
  return <section className="mt-6 rounded-2xl border border-border bg-white p-6" aria-label="Host payments">
    <h2 className="text-xl font-semibold">Sandbox payments</h2>
    <p className="mt-2 text-sm text-muted">Test money only. Host funds release after the reservation ends and Stripe funds become available. Bank arrival can take longer.</p>
    {!summary && !error && <p role="status">Checking Stripe setup…</p>}
    {summary && <p className="mt-3">{summary.ready ? "Stripe is ready for test bookings." : "Complete Stripe onboarding before accepting test payments."} Test funds transferred: ${(transferred/100).toFixed(2)}.</p>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button disabled={busy} onClick={()=>void setup()} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Opening Stripe…" : summary?.ready ? "Manage Stripe details" : "Set up Stripe"}</button>
      <button onClick={()=>void load()} className="rounded-xl border border-border px-4 py-3">Refresh status</button>
    </div>
  </section>;
}
