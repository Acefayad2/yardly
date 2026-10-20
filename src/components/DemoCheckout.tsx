"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Space } from "@/lib/types";
import { bookingQuote, listingToday } from "@/lib/booking";
import { hourLabel } from "@/lib/availability";
import { readDemoBookings, saveDemoBookings, validDemoBooking, type DemoBooking } from "@/lib/demo-bookings";

export default function DemoCheckout({ space }: { space: Space }) {
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(10);
  const [hours, setHours] = useState(space.minHours);
  const [guests, setGuests] = useState(2);
  const [step, setStep] = useState<"details" | "review" | "confirmed">("details");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const committed = useRef(false);
  useEffect(() => { if (step !== "details") heading.current?.focus(); }, [step]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plannedDate = params.get("date") ?? "";
    const requestedGuests = Number(params.get("guests"));
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(plannedDate)
      && !Number.isNaN(Date.parse(plannedDate))
      && new Date(plannedDate).toISOString().slice(0, 10) === plannedDate
      && plannedDate >= listingToday(space.timezone);
    queueMicrotask(() => {
      if (validDate) setDate(plannedDate);
      if (params.has("guests") && Number.isInteger(requestedGuests)) {
        setGuests(Math.min(space.capacity, Math.max(1, requestedGuests)));
      }
    });
  }, [space.capacity, space.timezone]);
  const today = listingToday(space.timezone);
  const quote = bookingQuote(space.hourlyPrice, hours);
  const control = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm";
  const primary = "mt-5 w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50";

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date < today) return setError("Choose today or a future date for this demonstration.");
    committed.current = false;
    setError(""); setAcknowledged(false); setStep("review");
  }

  function confirm() {
    if (!acknowledged || step !== "review" || committed.current) return;
    const booking: DemoBooking = { id: `DEMO-${crypto.randomUUID()}`, spaceId: space.id, date, startHour, hours, guests, status: "confirmed" };
    if (!space.isDemo || date < listingToday(space.timezone) || !validDemoBooking(booking)) {
      setError("Please return to details and choose a valid date and time."); return;
    }
    try {
      saveDemoBookings([booking, ...readDemoBookings()]);
      committed.current = true;
      setReceipt(booking.id); setStep("confirmed"); setError("");
    } catch { setError("Browser storage is unavailable. Enable session storage to save this demo booking, then try again."); }
  }

  return <section id="booking" aria-label="Demo booking and checkout" className="scroll-mt-28 rounded-2xl border border-border bg-background p-6 shadow-xl shadow-foreground/10">
    <p className="mb-5 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo mode · No real charge or reservation</p>
    {step === "confirmed" ? <div role="status">
      <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">✓</div>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Demo booking confirmed</h2>
      <p className="mt-3 text-sm text-muted">Your simulated checkout is complete. No money was collected, no space was reserved, and no host was notified.</p>
      <p className="mt-4 font-semibold">{space.title}</p>
      <p className="mt-2 text-sm">{date} · {hourLabel(startHour)}–{hourLabel(startHour + hours)} · {guests} guests</p>
      <p className="mt-2 text-sm">Simulated total: ${quote.total.toFixed(2)} · Charged: $0.00</p>
      <p className="mt-3 break-all text-xs text-muted">Reference: {receipt}</p>
      <Link href="/trips#demo-bookings" className={`${primary} block text-center`}>View demo booking</Link>
      <button type="button" className="mt-4 w-full text-sm font-semibold underline" onClick={() => { setStep("details"); setAcknowledged(false); }}>Try another demo</button>
    </div> : <>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">{step === "details" ? "Try a demo booking" : "Review demo checkout"}</h2>
      <p className="mt-2 text-sm text-muted">{step === "details" ? "Sample hours only—not verified host availability. Choose one day, then review checkout." : "This test payment method demonstrates checkout without collecting card details."}</p>
      {step === "details" ? <form onSubmit={review} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Demo date<input required type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className={control} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Demo start<select aria-label="Demo start" className={control} value={startHour} onChange={e => { const start = Number(e.target.value); setStartHour(start); setHours(Math.min(hours, 22 - start)); }}>
            {Array.from({ length: 15 - space.minHours }, (_, i) => i + 8).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select></label>
          <label className="text-sm font-semibold">Demo duration<select aria-label="Demo duration" className={control} value={hours} onChange={e => setHours(Number(e.target.value))}>
            {Array.from({ length: 23 - startHour - space.minHours }, (_, i) => i + space.minHours).map(h => <option key={h} value={h}>{h} hours</option>)}
          </select></label>
        </div>
        <label className="block text-sm font-semibold">Demo guests<select aria-label="Demo guests" value={guests} className={control} onChange={e => setGuests(Number(e.target.value))}>
          {Array.from({ length: space.capacity }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
        </select></label>
        <p className="text-xs text-muted">Sample schedule timezone: {space.timezone.replaceAll("_", " ")}. Minimum {space.minHours} hours.</p>
        <button className={primary} type="submit">Continue to demo checkout</button>
      </form> : <div className="mt-5 space-y-4">
        <div className="rounded-xl bg-surface-soft p-4 text-sm"><p className="font-semibold">{space.title}</p><p className="mt-2">{date} · {hourLabel(startHour)}–{hourLabel(startHour + hours)}</p><p>{guests} guests · {space.timezone.replaceAll("_", " ")}</p></div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt>${space.hourlyPrice} × {hours} hours</dt><dd>${quote.subtotal.toFixed(2)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Illustrative service fee</dt><dd>${quote.serviceFee.toFixed(2)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-border pt-3 font-semibold"><dt>Demo total</dt><dd>${quote.total.toFixed(2)}</dd></div>
        </dl>
        <div className="rounded-xl border border-brand bg-emerald-50 p-4"><p className="text-sm font-semibold">Test payment method</p><p className="mt-1 text-xs text-muted">Built-in simulator · No card entry · $0.00 charged</p></div>
        <p className="text-xs text-muted">Demo cancellation is free and only changes this browser session. Real cancellation/refund policies are not being applied.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-brand" />I understand this is a simulation, not a real payment or reservation.</label>
        <button type="button" className={primary} disabled={!acknowledged} onClick={confirm}>Simulate payment & confirm</button>
        <button type="button" onClick={() => { setStep("details"); setError(""); }} className="w-full text-sm font-semibold underline">Edit booking details</button>
      </div>}
      <p className="mt-4 text-xs text-muted">Demo bookings stay in this browser tab’s session and are separate from your account bookings.</p>
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>;
}
