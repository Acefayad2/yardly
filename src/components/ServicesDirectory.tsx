"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PROVIDER_CATEGORIES, fetchPublishedProviders, formatPriceUnit, providerHref } from "@/lib/providers";
import type { Provider, ProviderCategory } from "@/lib/types";

export default function ServicesDirectory() {
  const [category, setCategory] = useState<ProviderCategory | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selected: ProviderCategory | null) => {
    setLoading(true);
    setError(null);
    try {
      setProviders(await fetchPublishedProviders(selected ?? undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Providers could not be loaded.");
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchPublishedProviders(category ?? undefined)
      .then((result) => {
        if (!active) return;
        setProviders(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Providers could not be loaded.");
        setProviders([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category]);

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Services &amp; rentals</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Plan the whole event</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Compare event professionals and rental businesses serving your area, then request a quote. A request
          reserves nothing — the provider replies with a price, and you pay that provider directly.
        </p>

        <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <CategoryChip label="All providers" active={category === null} onClick={() => setCategory(null)} />
          {PROVIDER_CATEGORIES.map((item) => (
            <CategoryChip
              key={item.name}
              label={`${item.icon} ${item.name}`}
              active={category === item.name}
              onClick={() => setCategory(item.name)}
            />
          ))}
        </div>

        {error && (
          <div role="alert" className="mt-7 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <button type="button" onClick={() => void load(category)} className="font-semibold underline">
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div role="status" className="mt-8 rounded-2xl bg-white px-6 py-20 text-center text-muted">
            Loading providers…
          </div>
        ) : providers.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">
              📷
            </span>
            <h2 className="mt-5 text-xl font-semibold">No providers listed here yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Photography is the first category going live. If you run an event business, submit a profile and our
              team will review it before it appears publicly.
            </p>
            <Link href="/host/provider/" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">
              List your business
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active ? "border-brand bg-brand text-white" : "border-border-soft bg-white hover:bg-surface-soft"
      }`}
    >
      {label}
    </button>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border-soft bg-white">
      <Image src={provider.image} alt="" width={640} height={448} className="h-44 w-full object-cover" />
      <div className="p-4">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-dark">{provider.category}</span>
        <h2 className="mt-2 truncate text-lg font-semibold">{provider.businessName}</h2>
        {provider.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{provider.tagline}</p>}
        <p className="mt-3 text-sm text-muted">Serves {provider.serviceArea}</p>
        <p className="mt-3 text-sm font-semibold">
          From ${provider.startingPrice.toLocaleString()}{" "}
          <span className="font-normal text-muted">{formatPriceUnit(provider.priceUnit)}</span>
        </p>
        <Link
          href={providerHref(provider.id)}
          className="mt-4 inline-flex w-full justify-center rounded-xl border border-border-soft px-4 py-2.5 text-sm font-semibold transition hover:bg-surface-soft"
        >
          View profile &amp; request a quote
        </Link>
      </div>
    </article>
  );
}
