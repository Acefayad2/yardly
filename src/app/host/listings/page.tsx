"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import HostNav from "@/components/HostNav";
import { useStore } from "@/lib/store";
import { HostListingStatus } from "@/lib/types";

export default function HostListingsPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted">Loading listings…</div>}><ListingsContent /></Suspense>;
}

function ListingsContent() {
  const searchParams = useSearchParams();
  const { hostListings, setHostListingStatus } = useStore();

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12">
        {searchParams.get("created") === "1" && <div className="mb-6 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm font-medium text-brand-dark">Your listing draft is ready. Complete the remaining details when you are ready to publish.</div>}
        {searchParams.get("photoWarning") === "1" && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">Your draft was saved, but one or more photos could not be uploaded. You can add them again when editing the listing.</div>}
        <div className="flex items-end justify-between gap-5">
          <div><p className="text-sm font-semibold text-brand-dark">Your portfolio</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Listings</h1></div>
          <Link href="/host/listings/new" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Add a space</Link>
        </div>

        {hostListings.length ? (
          <div className="mt-8 space-y-4">
            {hostListings.map((listing) => (
              <article key={listing.id} className="grid gap-4 rounded-2xl border border-border-soft bg-white p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                <Image src={listing.image} alt="" width={640} height={448} className="h-36 w-full rounded-xl object-cover sm:h-28 sm:w-40" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><StatusBadge status={listing.status} /><span className="text-xs text-muted">{listing.spaceType}</span></div>
                  <h2 className="mt-2 truncate text-lg font-semibold">{listing.title}</h2>
                  <p className="mt-1 text-sm text-muted">{listing.location} · ${listing.hourlyPrice}/hour · Up to {listing.capacity} guests</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col">
                  {listing.status !== "published" && <ActionButton onClick={() => setHostListingStatus(listing.id, "published")}>Publish</ActionButton>}
                  {listing.status === "published" && <ActionButton onClick={() => setHostListingStatus(listing.id, "paused")}>Pause</ActionButton>}
                  {listing.status === "paused" && <ActionButton onClick={() => setHostListingStatus(listing.id, "draft")}>Move to draft</ActionButton>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">🏡</span>
            <h2 className="mt-5 text-xl font-semibold">Share your first outdoor space</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Create a draft in a few minutes, then add photos, availability, and rules before publishing.</p>
            <Link href="/host/listings/new" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Create listing</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: HostListingStatus }) {
  const styles = status === "published" ? "bg-emerald-50 text-emerald-700" : status === "paused" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${styles}`}>{status}</span>;
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-border-soft px-3 py-2 text-xs font-semibold transition hover:bg-surface-soft">{children}</button>;
}
