"use client";

import HostNav from "@/components/HostNav";
import HostSignInRequired from "@/components/HostSignInRequired";
import { useStore } from "@/lib/store";
import { useState } from "react";

export default function HostReservationsPage() {
  const { user, hostReservations, hostDataLoading, hostDataError, cancelBooking, refreshHostData } = useStore();
  const [filter, setFilter] = useState<"upcoming" | "completed" | "cancelled" | "all">("upcoming");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const filteredReservations = filter === "all" ? hostReservations : hostReservations.filter((reservation) => reservation.status === filter);

  if (!user) return <HostSignInRequired />;

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Guest activity</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Reservations</h1>
        <p className="mt-3 text-sm text-muted">Amounts shown are booking estimates, not collected payments or completed payouts.</p>
        <button type="button" disabled={hostDataLoading || cancelling} onClick={() => void refreshHostData()} className="mt-4 min-h-11 rounded-xl border border-border-soft bg-white px-4 text-sm font-semibold disabled:opacity-50">{hostDataLoading ? "Refreshing…" : "Refresh reservations"}</button>
        <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
          {(["upcoming", "completed", "cancelled", "all"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize ${filter === value ? 'bg-foreground text-white' : 'border border-border-soft bg-white'}`}>{value}</button>)}
        </div>
        {hostDataError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{hostDataError}</p>}
        {actionError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand-dark">{notice}</p>}
        {hostDataLoading ? (
          <div className="mt-5 rounded-2xl bg-white px-6 py-20 text-center" role="status">Loading reservations…</div>
        ) : filteredReservations.length ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border-soft bg-white">
            {filteredReservations.map((reservation) => (
              <div key={reservation.id} className="grid gap-3 border-b border-border-soft p-5 last:border-0 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div><p className="font-semibold">{reservation.guestName}</p><p className="mt-1 text-sm text-muted">{reservation.listingTitle}</p></div>
                <div><p className="text-sm font-medium">{formatDate(reservation.date)}</p><p className="mt-1 text-xs text-muted">{reservation.startTime}–{reservation.endTime} · {reservation.guests} guests</p></div>
                <div className="space-y-2 sm:text-right">
                  <p className="font-semibold">${reservation.payout.toFixed(2)} <span className="text-xs font-normal text-muted">estimated</span></p>
                  <p className="text-xs capitalize text-muted">{reservation.status}</p>
                  {reservation.status === "upcoming" && (confirmId === reservation.id ? <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-left" role="group" aria-label="Confirm reservation cancellation">
                    <p className="text-sm">Cancel this reservation and release its time slot? This does not issue a refund or send an email. Message your guest about the change.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={cancelling} onClick={async () => {
                        setCancelling(true); setActionError(""); setNotice("");
                        try {
                          const result = await cancelBooking(reservation.id);
                          if (result.error) { setActionError(result.error); return; }
                          setConfirmId(null); setNotice("Reservation cancelled. The time slot is available again if the listing is open.");
                        } catch { setActionError("Cancellation could not be confirmed. Refresh reservations before trying again."); }
                        finally { setCancelling(false); }
                      }} className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{cancelling ? "Cancelling…" : "Confirm cancellation"}</button>
                      <button type="button" disabled={cancelling} onClick={() => setConfirmId(null)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">Keep reservation</button>
                    </div>
                  </div> : <button type="button" disabled={cancelling} onClick={() => { setConfirmId(reservation.id); setActionError(""); setNotice(""); }} className="min-h-11 rounded-lg border border-border-soft px-3 text-sm font-semibold">Cancel reservation</button>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">📅</span>
            <h2 className="mt-5 text-xl font-semibold">No {filter === "all" ? "" : `${filter} `}reservations</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">When guests book one of your published spaces, their visit details and estimated booking amount will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
