"use client";

import HostNav from "@/components/HostNav";
import { useStore } from "@/lib/store";

export default function HostReservationsPage() {
  const { hostReservations } = useStore();

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Guest activity</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Reservations</h1>
        <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
          {['Upcoming', 'Completed', 'Cancelled', 'All'].map((label, index) => <button key={label} type="button" className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${index === 0 ? 'bg-foreground text-white' : 'border border-border-soft bg-white'}`}>{label}</button>)}
        </div>
        {hostReservations.length ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border-soft bg-white">
            {hostReservations.map((reservation) => (
              <div key={reservation.id} className="grid gap-3 border-b border-border-soft p-5 last:border-0 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div><p className="font-semibold">{reservation.guestName}</p><p className="mt-1 text-sm text-muted">{reservation.listingTitle}</p></div>
                <div><p className="text-sm font-medium">{formatDate(reservation.date)}</p><p className="mt-1 text-xs text-muted">{reservation.startTime}–{reservation.endTime} · {reservation.guests} guests</p></div>
                <p className="font-semibold">${reservation.payout}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">📅</span>
            <h2 className="mt-5 text-xl font-semibold">No reservations yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">When guests book one of your published spaces, you will see their visit details and expected payout here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
