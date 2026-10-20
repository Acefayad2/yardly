"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import HostNav from "@/components/HostNav";
import HostSignInRequired from "@/components/HostSignInRequired";
import QuoteStatusBadge from "@/components/QuoteStatusBadge";
import {
  fetchOwnedProviders,
  fetchQuoteRequestsForProviders,
  setQuoteRequestStatus,
  submitQuote,
} from "@/lib/providers";
import { useStore } from "@/lib/store";
import type { Provider, QuoteRequest } from "@/lib/types";

export default function HostQuotesPage() {
  const { user } = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (ownerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const owned = await fetchOwnedProviders(ownerId);
      setProviders(owned);
      setRequests(await fetchQuoteRequestsForProviders(owned.map((provider) => provider.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const ownerId = user.id;

    fetchOwnedProviders(ownerId)
      .then(async (owned) => {
        const open = await fetchQuoteRequestsForProviders(owned.map((provider) => provider.id));
        if (!active) return;
        setProviders(owned);
        setRequests(open);
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

  async function advance(id: string, status: "confirmed" | "declined" | "closed") {
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

  if (!user) return <HostSignInRequired />;

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Provider workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Quote requests</h1>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div role="status" className="mt-8 rounded-2xl bg-white px-6 py-20 text-center text-muted">
            Loading requests…
          </div>
        ) : providers.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border-soft bg-white px-6 py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">
              📷
            </span>
            <h2 className="mt-5 text-xl font-semibold">List your business first</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Submit a provider profile. Our team reviews it before it appears publicly, and quote requests arrive
              here once it is live.
            </p>
            <Link href="/host/provider/" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">
              Create a provider profile
            </Link>
          </div>
        ) : requests.length ? (
          <div className="mt-8 space-y-4">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                pending={pendingId === request.id}
                onAdvance={advance}
                onQuoted={() => void load(user.id)}
                onError={setError}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-soft bg-white px-6 py-20 text-center">
            <h2 className="text-xl font-semibold">No requests yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Planners who find your profile can send event details here. Requests appear as soon as your profile is
              published.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  pending,
  onAdvance,
  onQuoted,
  onError,
}: {
  request: QuoteRequest;
  pending: boolean;
  onAdvance: (id: string, status: "confirmed" | "declined" | "closed") => Promise<void>;
  onQuoted: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [totalPrice, setTotalPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [includes, setIncludes] = useState("");
  const [cancellationTerms, setCancellationTerms] = useState("");
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();

    const total = Number(totalPrice);
    const depositValue = deposit.trim() ? Number(deposit) : 0;

    if (!Number.isFinite(total) || total < 0) return onError("Enter the full quoted price.");
    if (!Number.isFinite(depositValue) || depositValue < 0 || depositValue > total) {
      return onError("The deposit must be between $0 and the full price.");
    }
    if (cancellationTerms.trim().length < 10) {
      return onError("Describe your cancellation terms in at least 10 characters.");
    }

    setSending(true);
    const result = await submitQuote({
      quoteRequestId: request.id,
      totalPrice: total,
      deposit: depositValue,
      includes,
      cancellationTerms,
    });
    setSending(false);

    if (result.error) return onError(result.error);
    setOpen(false);
    onQuoted();
  }

  return (
    <article className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <QuoteStatusBadge status={request.status} />
        <span className="text-xs text-muted">{request.providerName}</span>
      </div>
      <h2 className="mt-2 text-lg font-semibold">
        {request.eventDate} · {request.eventLocation}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {request.guestCount} guests
        {request.startTime ? ` · starts ${request.startTime}` : ""}
        {request.hours ? ` · ${request.hours}h` : ""}
        {request.needsDelivery ? " · delivery" : ""}
        {request.needsSetup ? " · setup" : ""}
        {request.needsPickup ? " · pickup" : ""}
      </p>
      {request.notes && <p className="mt-3 whitespace-pre-line text-sm leading-6">{request.notes}</p>}

      {request.items.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {request.items.map((item) => (
            <li key={item.id}>
              {item.quantity} × {item.name} (${item.unitPrice.toLocaleString()} each)
            </li>
          ))}
        </ul>
      )}

      {request.quote && (
        <div className="mt-4 rounded-xl bg-surface-soft p-4 text-sm">
          <p className="font-semibold">
            You quoted ${request.quote.totalPrice.toLocaleString()}
            {request.quote.deposit > 0 && ` · $${request.quote.deposit.toLocaleString()} deposit`}
          </p>
          {request.quote.includes && <p className="mt-2 leading-6">{request.quote.includes}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {request.status === "awaiting_reply" && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            {open ? "Cancel" : "Send a quote"}
          </button>
        )}
        {request.status === "accepted" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void onAdvance(request.id, "confirmed")}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Confirm the booking
          </button>
        )}
        {(request.status === "awaiting_reply" || request.status === "quoted" || request.status === "accepted") && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void onAdvance(request.id, "declined")}
            className="rounded-xl border border-border-soft px-5 py-2.5 text-sm font-semibold transition hover:bg-surface-soft disabled:opacity-60"
          >
            Decline
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={send} className="mt-4 grid gap-4 border-t border-border-soft pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Full price</span>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={totalPrice}
              onChange={(event) => setTotalPrice(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Deposit (optional)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold">What is included</span>
            <textarea
              rows={3}
              value={includes}
              onChange={(event) => setIncludes(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold">Cancellation terms</span>
            <textarea
              rows={3}
              required
              value={cancellationTerms}
              onChange={(event) => setCancellationTerms(event.target.value)}
              placeholder="Full refund up to 14 days before the event; the deposit is non-refundable inside 7 days."
              className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={sending}
              className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {sending ? "Sending quote…" : "Send quote"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
