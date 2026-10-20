"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createQuoteRequest, formatPriceUnit } from "@/lib/providers";
import { useStore } from "@/lib/store";
import type { Provider } from "@/lib/types";

const CANCELLATION_NOTE =
  "Sending a request does not reserve anything. The provider replies with a full price, deposit and cancellation terms, you accept and pay that provider directly, and the provider confirms the booking.";

export default function ProviderDetail({ provider }: { provider: Provider }) {
  const { user, setAuthOpen } = useStore();
  const isRental = provider.kind === "rental";

  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [hours, setHours] = useState("");
  const [guestCount, setGuestCount] = useState("25");
  const [notes, setNotes] = useState("");
  const [needsDelivery, setNeedsDelivery] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsPickup, setNeedsPickup] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isOwnProfile = user?.id === provider.ownerId;

  const requestedItems = useMemo(
    () =>
      Object.entries(quantities)
        .map(([rentalItemId, value]) => ({ rentalItemId, quantity: Number(value) }))
        .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0),
    [quantities],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }

    setError(null);

    const guests = Number(guestCount);
    if (!eventDate) return setError("Choose the event date.");
    if (eventLocation.trim().length < 2) return setError("Add the event location.");
    if (!Number.isInteger(guests) || guests < 1) return setError("Enter the expected guest count.");

    const parsedHours = hours.trim() ? Number(hours) : null;
    if (parsedHours !== null && (!Number.isFinite(parsedHours) || parsedHours < 0.5 || parsedHours > 24)) {
      return setError("Hours must be between 0.5 and 24.");
    }

    setSubmitting(true);
    const result = await createQuoteRequest(user.id, {
      providerId: provider.id,
      eventDate,
      eventLocation,
      startTime: startTime || null,
      hours: parsedHours,
      guestCount: guests,
      notes,
      needsDelivery,
      needsSetup,
      needsPickup,
      items: requestedItems,
    });
    setSubmitting(false);

    if (result.error) return setError(result.error);
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-12">
        <Link href="/services/" className="text-sm font-semibold text-brand-dark">
          ← All providers
        </Link>

        <div className="mt-5 overflow-hidden rounded-2xl border border-border-soft bg-white">
          <Image src={provider.image} alt="" width={1600} height={900} className="h-64 w-full object-cover sm:h-80" />
          <div className="p-5 sm:p-7">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-dark">{provider.category}</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{provider.businessName}</h1>
            {provider.tagline && <p className="mt-2 text-muted">{provider.tagline}</p>}
            <p className="mt-4 text-sm text-muted">Serves {provider.serviceArea}</p>
            <p className="mt-2 text-lg font-semibold">
              From ${provider.startingPrice.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted">{formatPriceUnit(provider.priceUnit)}</span>
            </p>
            {provider.description && (
              <p className="mt-5 whitespace-pre-line text-sm leading-6">{provider.description}</p>
            )}
          </div>
        </div>

        {provider.images.length > 1 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Work samples</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {provider.images.slice(1).map((image) => (
                <Image key={image} src={image} alt="" width={640} height={448} className="h-40 w-full rounded-xl object-cover" />
              ))}
            </div>
          </section>
        )}

        {provider.services.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border-soft bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold">What they offer</h2>
            <ul className="mt-4 space-y-3">
              {provider.services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold">{service.name}</p>
                    {service.description && <p className="mt-1 text-sm text-muted">{service.description}</p>}
                  </div>
                  <p className="text-sm font-semibold">
                    From ${service.startingPrice.toLocaleString()}{" "}
                    <span className="font-normal text-muted">{formatPriceUnit(service.priceUnit)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-border-soft bg-white p-5 sm:p-7">
          <h2 className="text-lg font-semibold">Request a quote</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{CANCELLATION_NOTE}</p>

          {sent ? (
            <div className="mt-5 rounded-xl border border-brand/20 bg-brand/5 px-4 py-4 text-sm font-medium text-brand-dark">
              Your request is with {provider.businessName}. You can follow the reply in{" "}
              <Link href="/quotes/" className="underline">
                your requests
              </Link>
              .
            </div>
          ) : isOwnProfile ? (
            <p className="mt-5 rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
              This is your own profile, so you cannot request a quote from it.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Event date">
                <input
                  type="date"
                  required
                  min={today}
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>
              <Field label="Event location">
                <input
                  type="text"
                  required
                  placeholder="Baltimore, MD"
                  value={eventLocation}
                  onChange={(event) => setEventLocation(event.target.value)}
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>
              <Field label="Start time (optional)">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>
              <Field label="Hours needed (optional)">
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>
              <Field label="Guest count">
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={guestCount}
                  onChange={(event) => setGuestCount(event.target.value)}
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>

              {isRental && provider.rentalItems.length > 0 && (
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-semibold">Equipment and quantities</legend>
                  <div className="mt-3 space-y-3">
                    {provider.rentalItems.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            ${item.unitPrice.toLocaleString()} each · {item.availableQuantity.toLocaleString()} available ·
                            minimum {item.minQuantity}
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold">
                          <span className="sr-only">{item.name} quantity</span>
                          <input
                            type="number"
                            min={0}
                            max={item.availableQuantity}
                            value={quantities[item.id] ?? ""}
                            onChange={(event) =>
                              setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                            className="w-24 rounded-lg border border-border-soft px-2 py-2 text-sm"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <Toggle label="Delivery" checked={needsDelivery} onChange={setNeedsDelivery} />
                    <Toggle label="Setup" checked={needsSetup} onChange={setNeedsSetup} />
                    <Toggle label="Pickup" checked={needsPickup} onChange={setNeedsPickup} />
                  </div>
                </fieldset>
              )}

              <Field label="What do you need?" className="sm:col-span-2">
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Two hours of coverage during a backyard graduation party, plus edited photos."
                  className="w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
                />
              </Field>

              {error && (
                <p role="alert" className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? "Sending request…" : user ? "Send request" : "Sign in to request"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border-soft"
      />
      {label}
    </label>
  );
}
