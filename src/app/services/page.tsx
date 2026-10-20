"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProviderDetail from "@/components/ProviderDetail";
import ServicesDirectory from "@/components/ServicesDirectory";
import { fetchProvider } from "@/lib/providers";
import type { Provider } from "@/lib/types";

export default function ServicesPage() {
  return (
    <Suspense fallback={<ServicesStatus title="Loading providers…" body="Retrieving the latest provider profiles." />}>
      <ServicesContent />
    </Suspense>
  );
}

function ServicesContent() {
  const providerId = useSearchParams().get("id");

  if (!providerId) return <ServicesDirectory />;
  return <ProviderRoute providerId={providerId} />;
}

function ProviderRoute({ providerId }: { providerId: string }) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchProvider(providerId)
      .then((result) => {
        if (!active) return;
        setProvider(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "This provider could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  if (loading) return <ServicesStatus title="Loading provider…" body="Retrieving the latest profile details." />;
  if (error) return <ServicesStatus title="This provider could not be loaded" body={error} />;
  if (!provider || provider.status !== "published") {
    return (
      <ServicesStatus
        title="This provider is not available"
        body="The profile may be paused, or still waiting on Yardly review."
      >
        <Link href="/services/" className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">
          Browse providers
        </Link>
      </ServicesStatus>
    );
  }

  return <ProviderDetail provider={provider} />;
}

function ServicesStatus({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center" role="status">
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children && <div className="mt-7">{children}</div>}
    </main>
  );
}
