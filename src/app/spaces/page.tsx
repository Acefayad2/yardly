"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SpaceDetail from "@/components/SpaceDetail";
import { useStore } from "@/lib/store";

export default function SpacePage() {
  return (
    <Suspense fallback={<SpaceStatus title="Loading space…" body="Retrieving the latest listing details." />}>
      <SpaceContent />
    </Suspense>
  );
}

function SpaceContent() {
  const listingId = useSearchParams().get("id");
  const { spaces, marketplaceLoading, marketplaceError, refreshMarketplace } = useStore();
  const space = spaces.find((item) => item.id === listingId);

  if (marketplaceLoading) return <SpaceStatus title="Loading space…" body="Retrieving the latest listing details." />;
  if (marketplaceError) {
    return (
      <SpaceStatus title="This space could not be loaded" body={marketplaceError}>
        <button type="button" onClick={() => void refreshMarketplace()} className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-white">Try again</button>
      </SpaceStatus>
    );
  }
  if (!space) {
    return (
      <SpaceStatus title="This space is not available" body="It may be paused, unpublished, or no longer accepting bookings.">
        <Link href="/" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Explore available spaces</Link>
      </SpaceStatus>
    );
  }

  return <SpaceDetail space={space} />;
}

function SpaceStatus({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center" role="status">
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children && <div className="mt-7">{children}</div>}
    </main>
  );
}
