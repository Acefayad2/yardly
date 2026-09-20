"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_SPACES } from "@/lib/demo-spaces";
import { bookingQuote } from "@/lib/booking";
import { hourLabel } from "@/lib/availability";
import { spaceHref } from "@/lib/spaces";
import { DEMO_BOOKINGS_EVENT, readDemoBookings, saveDemoBookings, type DemoBooking } from "@/lib/demo-bookings";

export default function DemoBookings() {
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => setBookings(readDemoBookings());
    queueMicrotask(load);
    window.addEventListener(DEMO_BOOKINGS_EVENT, load);
    return () => window.removeEventListener(DEMO_BOOKINGS_EVENT, load);
  }, []);
  if (!bookings.length) return null;
  return <section id="demo-bookings" aria-label="Demo bookings" className="mt-6 scroll-mt-28 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
    <h2 className="text-xl font-semibold">Your demo bookings</h2>
    <p className="text-sm text-muted">Simulated only · No charges, host notifications, or reserved availability. Saved in this tab’s session, not your account.</p>
    {bookings.map(booking => {
      const space = DEMO_SPACES.find(item => item.id === booking.spaceId)!;
      const total = bookingQuote(space.hourlyPrice, booking.hours).total;
      return <article key={booking.id} className="rounded-xl border border-border bg-background p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Demo · {booking.status === "cancelled" ? "Cancelled" : "Confirmed"}</p>
        <Link href={spaceHref(space.id)} className="mt-2 block font-semibold hover:underline">{space.title}</Link>
        <p className="mt-2 text-sm">{booking.date} · {hourLabel(booking.startHour)}–{hourLabel(booking.startHour + booking.hours)} · {booking.guests} guests</p>
        <p className="mt-1 text-xs text-muted">{space.timezone.replaceAll("_", " ")} · Simulated total ${total.toFixed(2)} · Charged $0.00</p>
        <p className="mt-2 break-all text-xs text-muted">{booking.id}</p>
        {booking.status === "cancelled" ? <p role="status" className="mt-3 text-sm">Demo cancelled. No refund is needed because no payment was taken.</p> : <button type="button" className="mt-4 text-sm font-semibold underline" onClick={() => {
          try { saveDemoBookings(readDemoBookings().map(item => item.id === booking.id ? { ...item, status: "cancelled" } : item)); setError(""); }
          catch { setError("Could not save the cancellation. Check browser storage and try again."); }
        }}>Cancel demo booking</button>}
      </article>;
    })}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
