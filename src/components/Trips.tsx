"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useStore } from "@/lib/store";

export default function Trips() {
  const { user, bookings, cancelBooking, setAuthOpen } = useStore();
  const justBooked = useSearchParams().get("booked") === "1";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
      <h1 className="text-3xl font-semibold">Trips</h1>

      {justBooked && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth={2}><path d="M5 12l4 4 10-11" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="font-medium">Reservation confirmed! Your trip is booked.</p>
        </div>
      )}

      {!user ? (
        <div className="mt-10 rounded-2xl border border-border p-10 text-center">
          <p className="text-lg font-semibold">Log in to see your trips</p>
          <p className="mt-1 text-muted">Your reservations will appear here once you&apos;re signed in.</p>
          <button
            onClick={() => setAuthOpen(true)}
            className="mt-5 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-white"
          >
            Log in
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border p-10 text-center">
          <p className="text-lg font-semibold">No trips booked… yet!</p>
          <p className="mt-1 text-muted">Time to dust off your bags and start planning your next adventure.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl border border-foreground px-6 py-3 text-sm font-semibold hover:bg-border-soft">
            Start searching
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {bookings.map((b) => (
            <div key={b.id} className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row">
              <Link href={`/rooms/${b.listingId}`} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt={b.title} className="h-40 w-full rounded-xl object-cover sm:h-32 sm:w-48" />
              </Link>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <p className="text-sm text-muted">{b.location}</p>
                  <Link href={`/rooms/${b.listingId}`} className="font-semibold hover:underline">{b.title}</Link>
                  <p className="mt-1 text-sm">
                    {format(new Date(b.checkIn), "MMM d")} – {format(new Date(b.checkOut), "MMM d, yyyy")} · {b.guests} {b.guests === 1 ? "guest" : "guests"}
                  </p>
                  <p className="text-sm text-muted">{b.nights} nights · ${b.total} total</p>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => cancelBooking(b.id)}
                    className="text-sm font-semibold text-rausch underline"
                  >
                    Cancel reservation
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
