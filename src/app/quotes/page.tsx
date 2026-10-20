"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  QUOTE_STATUS_LABELS,
  fetchQuoteRequestsForRequester,
  providerHref,
  setQuoteRequestStatus,
} from "@/lib/providers";
import { useStore } from "@/lib/store";
import type { QuoteRequest } from "@/lib/types";
import QuoteStatusBadge from "@/components/QuoteStatusBadge";

export default function QuotesPage() {
  const { user, authLoading, setAuthOpen } = useStore();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (requesterId: string) => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchQuoteRequestsForRequester(requesterId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) {
      Promise.resolve().then(() => {
        if (!active) return;
        setRequests([]);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    fetchQuoteRequestsForRequester(user.id)
      .then((result) => {
        if (!active) return;
        setRequests(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Your requests could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  async function updateStatus(id: string, status: "accepted" | "closed") {
    if (!user) return;
    setPendingId(id);
    const result = await setQuoteRequestStatus(id, status);
    setPendingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load(user.id);
  }

  if (authLoading) {
    return <QuotesStatus title="Checking your account…" body="One moment." />;
  }

  if (!user) {
    return (
      <QuotesStatus title="Sign in to see your requests" body="Quote requests are tied to your Yardly account.">
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white"
        >
          Sign in
        </button>
      </QuotesStatus>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Services &amp; rentals</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Your quote requests</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Each provider replies with its own quote. Accepting a quote tells the provider you are going ahead and
          paying them directly — the provider then confirms the booking.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div role="status" className="mt-8 rounded-2xl bg-white px-6 py-20 text-center text-muted">
            Loading your requests…
          </div>
        ) : requests.length ? (
          <div className="mt-8 space-y-4">
            {requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Image
                    src={request.providerImage}
                    alt=""
                    width={320}
                    height={224}
                    className="h-20 w-28 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <QuoteStatusBadge status={request.status} />
                      <span className="text-xs text-muted">{request.providerCategory}</span>
                    </div>
                    <h2 className="mt-2 truncate text-lg font-semibold">
                      <Link href={providerHref(request.providerId)} className="hover:underline">
                        {request.providerName}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {request.eventDate} · {request.eventLocation} · {request.guestCount} guests
                      {request.hours ? ` · ${request.hours}h` : ""}
                    </p>
                  </div>
                </div>

                {request.items.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm text-muted">
                    {request.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity} × {item.name}
                      </li>
                    ))}
                  </ul>
                )}

                {request.quote ? (
                  <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
                    <p className="text-sm font-semibold text-brand-dark">
                      Quoted ${request.quote.totalPrice.toLocaleString()}
                      {request.quote.deposit > 0 && ` · $${request.quote.deposit.toLocaleString()} deposit`}
                    </p>
                    {request.quote.includes && <p className="mt-2 text-sm leading-6">{request.quote.includes}</p>}
                    <p className="mt-2 text-xs leading-5 text-muted">
                      Cancellation terms: {request.quote.cancellationTerms}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">{QUOTE_STATUS_LABELS[request.status]}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {request.status === "quoted" && (
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => void updateStatus(request.id, "accepted")}
                      className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Accept and pay the provider
                    </button>
                  )}
                  {request.status !== "confirmed" && request.status !== "closed" && request.status !== "declined" && (
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => void updateStatus(request.id, "closed")}
                      className="rounded-xl border border-border-soft px-5 py-2.5 text-sm font-semibold transition hover:bg-surface-soft disabled:opacity-60"
                    >
                      Close request
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">
              📝
            </span>
            <h2 className="mt-5 text-xl font-semibold">No requests yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Find a photographer or rental business and send your event details to get a quote.
            </p>
            <Link href="/services/" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">
              Browse providers
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function QuotesStatus({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center" role="status">
      <h1 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {children && <div className="mt-7">{children}</div>}
    </main>
  );
}
