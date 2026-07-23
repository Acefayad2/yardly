"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useStore } from "@/lib/store";

function timeLabel(t: string) {
  const hour = parseInt(t.split(":")[0], 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

export default function Bookings() {
  const { user, bookings, cancelBooking, setAuthOpen } = useStore();
  const justBooked = useSearchParams().get("booked") === "1";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
      <h1 className="text-3xl font-semibold">Your bookings</h1>

      {justBooked && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth={2}><path d="M5 12l4 4 10-11" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="font-medium">Booking confirmed! The host will share the exact address shortly.</p>
        </div>
      )}

      {!user ? (
        <div className="mt-10 rounded-2xl border border-border p-10 text-center">
          <p className="text-lg font-semibold">Log in to see your bookings</p>
          <p className="mt-1 text-muted">Your reserved spaces will appear here once you&apos;re signed in.</p>
          <button
            onClick={() => setAuthOpen(true)}
            className="mt-5 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-white"
          >
            Log in
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border p-10 text-center">
          <p className="text-lg font-semibold">No bookings yet</p>
          <p className="mt-1 text-muted">Find a backyard, pool, or patio and book your next gathering.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl border border-foreground px-6 py-3 text-sm font-semibold hover:bg-border-soft">
            Explore spaces
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {bookings.map((b) => (
            <div key={b.id} className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row">
              <Link href={`/spaces/${b.spaceId}`} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt={b.title} className="h-40 w-full rounded-xl object-cover sm:h-32 sm:w-48" />
              </Link>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <p className="text-sm text-muted">{b.location}</p>
                  <Link href={`/spaces/${b.spaceId}`} className="font-semibold hover:underline">{b.title}</Link>
                  <p className="mt-1 text-sm">
                    {format(new Date(b.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                  </p>
                  <p className="text-sm text-muted">
                    {b.fullDay
                      ? "Full day"
                      : `${timeLabel(b.startTime)} – ${timeLabel(b.endTime)} · ${b.hours} hrs`}
                    {" · "}{b.guests} {b.guests === 1 ? "guest" : "guests"} · ${b.total} total
                  </p>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => cancelBooking(b.id)}
                    className="text-sm font-semibold text-brand underline"
                  >
                    Cancel booking
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
