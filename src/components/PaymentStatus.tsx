"use client";
import { useCallback, useEffect, useState } from "react";
import { paymentRequest } from "@/lib/payments";

export default function PaymentStatus({id}:{id:string}) {
  const [state,setState]=useState(""); const [error,setError]=useState("");
  const check=useCallback(async()=>{
    try{const result=await paymentRequest(`payment-status?id=${encodeURIComponent(id)}`);setState(result.state);setError("");}
    catch(e){setError(e instanceof Error ? e.message : "Could not check payment.");}
  },[id]);
  useEffect(()=>{void paymentRequest(`payment-status?id=${encodeURIComponent(id)}`).then(result=>setState(result.state)).catch(e=>setError(e instanceof Error ? e.message : "Could not check payment."));},[id]);
  const messages:Record<string,string>={pending:"Checkout is not complete. Your time is temporarily held; it will be released after checkout expires.",paid:"Test payment received and booking confirmed. Refresh your bookings to see it below.",expired:"Checkout expired. No booking was confirmed.",refund_requested:"Cancellation received. Your test refund is being processed.",refunded:"Your test payment has been refunded.",blocked:"Your payment needs support review. Do not pay again.",releasing:"Your reservation has ended. Host transfer is processing.",transferred:"Reservation completed and test funds transferred to the host."};
  return <section className="mt-5 rounded-2xl border border-border bg-surface-soft p-5" aria-label="Payment status">
    <h2 className="font-semibold">Sandbox payment status</h2>
    <p className="mt-2" role="status">{messages[state] ?? "Checking your payment…"}</p>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <button onClick={()=>void check()} className="mt-3 min-h-11 font-semibold underline">Check again</button>
  </section>;
}
