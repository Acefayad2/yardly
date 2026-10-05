"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { spaceHref } from "@/lib/spaces";
import { useRef, useState } from "react";
import DemoBookings from "./DemoBookings";
import BookingContact from "./BookingContact";
import NearbyActivities from "./NearbyActivities";

function timeLabel(t: string) {
  const hour = parseInt(t.split(":")[0], 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

export default function Bookings() {
  const { user, bookings, spaces, bookingsLoading, bookingsError, cancelBooking, setAuthOpen } = useStore();
  const params = useSearchParams();
  const justBooked = params.get("booked") === "1";
  const requestedId = params.get("booking");
  const visibleBookings = requestedId ? bookings.filter((booking) => booking.id === requestedId) : bookings;
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancellationInFlight = useRef(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function cancel(id: string) {
    if (cancellationInFlight.current) return;
    cancellationInFlight.current = true;
    setCancellingId(id);
    setActionError("");
    try {
      const result = await cancelBooking(id);
      if (result.error) setActionError(result.error);
      else setConfirmCancelId(null);
    } catch {
      setActionError("Cancellation could not be confirmed. Refresh your bookings before trying again.");
    } finally {
      cancellationInFlight.current = false;
      setCancellingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
      <h1 className="text-3xl font-semibold">Your bookings</h1>
      {requestedId && <Link href="/bookings/" className="mt-3 inline-block text-sm font-semibold text-brand underline">View all bookings</Link>}
      <DemoBookings />

      {justBooked && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth={2}><path d="M5 12l4 4 10-11" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="font-medium">Booking confirmed! The exact address is now shown on the listing and in your trips.</p>
        </div>
      )}

      {actionError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}
      {bookingsError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{bookingsError}</p>}

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
      ) : bookingsLoading ? (
        <div className="mt-10 rounded-2xl bg-surface-soft p-10 text-center" role="status">Loading your reservations…</div>
      ) : requestedId && visibleBookings.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-border p-10 text-center">This booking is not available for this account.</p>
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
          {visibleBookings.map((b) => (
            <div key={b.id} className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row">
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt={b.title} className="h-40 w-full rounded-xl object-cover sm:h-32 sm:w-48" />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <p className="text-sm text-muted">{b.location}</p>
                  {spaces.some((space) => space.id === b.spaceId && !space.isDemo)
                    ? <Link href={spaceHref(b.spaceId)} className="font-semibold hover:underline">{b.title}</Link>
                    : <><p className="font-semibold">{b.title}</p><p className="text-xs text-muted">Listing is not currently available. Your reservation details are saved below.</p></>}
                  <p className="mt-1 text-sm">
                    {format(new Date(b.date + "T00:00:00"), "EEE, MMM d, yyyy")}
                  </p>
                  <p className="text-sm text-muted">
                    {`${timeLabel(b.startTime)} – ${timeLabel(b.endTime)} · ${b.hours} hrs`}
                    {" · "}{b.guests} {b.guests === 1 ? "guest" : "guests"} · ${b.total} total
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">{b.status}</p>
                </div>
                <div className="mt-3 space-y-3">
                  <BookingContact listingId={b.spaceId} />
                  {b.status !== "cancelled" && <NearbyActivities key={`${user.id}-${b.id}`} listingId={b.spaceId} />}
                  {b.status !== "cancelled" && b.status !== "completed" && (
                    confirmCancelId === b.id ? (
                      <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-left" role="group" aria-label="Confirm cancelling this booking" aria-busy={cancellingId === b.id}>
                        <p className="text-sm">Cancel this booking? This can&apos;t be undone.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={cancellingId !== null}
                            onClick={() => void cancel(b.id)}
                            className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                          >
                            {cancellingId === b.id ? "Cancelling…" : "Confirm cancel"}
                          </button>
                          <button
                            type="button"
                            disabled={cancellingId !== null}
                            onClick={() => setConfirmCancelId(null)}
                            className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                          >
                            Keep booking
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={cancellingId !== null}
                        onClick={() => setConfirmCancelId(b.id)}
                        className="text-sm font-semibold text-brand underline disabled:cursor-wait disabled:opacity-60"
                      >
                        Cancel booking
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
