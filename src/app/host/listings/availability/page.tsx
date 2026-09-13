"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HostNav from "@/components/HostNav";
import HostSignInRequired from "@/components/HostSignInRequired";
import HostAvailabilityEditor from "@/components/HostAvailabilityEditor";
import { useStore } from "@/lib/store";

export default function AvailabilityPage() {
  return <Suspense fallback={<p className="p-12" role="status">Loading availability…</p>}><AvailabilityContent /></Suspense>;
}

function AvailabilityContent() {
  const id = useSearchParams().get("id") ?? "";
  const { user, authLoading, hostListings, hostDataLoading, hostDataError } = useStore();
  if (authLoading) return <p className="p-12" role="status">Checking your session…</p>;
  if (!user) return <HostSignInRequired />;
  const listing = hostListings.find((item) => item.id === id);
  return <div className="min-h-screen bg-surface-soft">
    <HostNav />
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
      <Link href="/host/listings/" className="text-sm font-semibold text-brand-dark">← Back to listings</Link>
      {hostDataLoading ? <p className="mt-8" role="status">Loading your listing…</p>
        : hostDataError ? <p className="mt-8" role="alert">{hostDataError}</p>
        : listing ? <HostAvailabilityEditor key={listing.id} listing={listing} userId={user.id} />
        : <p className="mt-8">Listing not found, or it belongs to another account.</p>}
    </main>
  </div>;
}
