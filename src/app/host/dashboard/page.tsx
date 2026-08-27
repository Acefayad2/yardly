"use client";

import Link from "next/link";
import HostNav from "@/components/HostNav";
import { useStore } from "@/lib/store";

export default function HostDashboardPage() {
  const { user, hostListings, hostReservations, setAuthOpen } = useStore();
  const upcoming = hostReservations.filter((reservation) => reservation.status === "upcoming");
  const earnings = hostReservations.filter((reservation) => reservation.status !== "cancelled").reduce((sum, reservation) => sum + reservation.payout, 0);

  if (!user) {
    return (
      <div>
        <HostNav />
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Sign in to host</h1>
          <p className="mt-3 text-muted">Your host dashboard, listings, and reservations are connected to your Yardly account.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className="mt-7 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white">Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-dark">Host dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Welcome back, {user.name.split(" ")[0]}</h1>
            <p className="mt-2 text-sm text-muted">Here is what is happening with your spaces.</p>
          </div>
          <Link href="/host/listings/new" className="inline-flex w-fit rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Add a space</Link>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Hosting summary">
          <Metric label="Upcoming reservations" value={upcoming.length.toString()} detail="Next 30 days" />
          <Metric label="Active listings" value={hostListings.filter((listing) => listing.status === "published").length.toString()} detail={`${hostListings.length} total`} />
          <Metric label="Estimated earnings" value={`$${earnings.toLocaleString()}`} detail="After Yardly fees" />
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <section className="rounded-2xl border border-border-soft bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Next up</p>
                <h2 className="mt-1 text-xl font-semibold">Reservations</h2>
              </div>
              <Link href="/host/reservations" className="text-sm font-semibold text-brand-dark">View all</Link>
            </div>
            {upcoming.length ? (
              <div className="mt-5 divide-y divide-border-soft">
                {upcoming.slice(0, 3).map((reservation) => (
                  <div key={reservation.id} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-semibold">{reservation.guestName}</p>
                      <p className="mt-1 text-sm text-muted">{reservation.listingTitle} · {formatDate(reservation.date)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">${reservation.payout}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock title="No upcoming reservations" text="New bookings will appear here as soon as guests reserve your space." />
            )}
          </section>

          <section className="rounded-2xl bg-[#193b2a] p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Hosting tip</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">A complete listing gets booked sooner.</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">Add clear photos, arrival instructions, amenities, and thoughtful rules so guests know exactly what to expect.</p>
            <Link href={hostListings.length ? "/host/listings" : "/host/listings/new"} className="mt-7 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#193b2a]">
              {hostListings.length ? "Review listings" : "Create a listing"}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-border-soft bg-white p-5"><p className="text-sm text-muted">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function EmptyBlock({ title, text }: { title: string; text: string }) {
  return <div className="mt-5 rounded-xl bg-surface-soft px-5 py-10 text-center"><p className="font-semibold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{text}</p></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
