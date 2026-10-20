"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import HostNav from "@/components/HostNav";
import HostSignInRequired from "@/components/HostSignInRequired";
import {
  PROVIDER_CATEGORIES,
  createProviderProfile,
  fetchOwnedProviders,
  formatPriceUnit,
} from "@/lib/providers";
import { useStore } from "@/lib/store";
import type { Provider, ProviderCategory, ProviderStatus } from "@/lib/types";

const STATUS_COPY: Record<ProviderStatus, string> = {
  draft: "Saved as a draft. Submit it when you are ready for review.",
  pending_review: "With the Yardly team for review. We check every profile before it appears publicly.",
  published: "Live in the services directory.",
  rejected: "Needs changes before it can be published.",
  paused: "Hidden from the directory. Ask us to publish it again when you are ready.",
};

export default function HostProviderPage() {
  const { user } = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ownerId: string) => {
    setLoading(true);
    setError(null);
    try {
      setProviders(await fetchOwnedProviders(ownerId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profiles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    fetchOwnedProviders(user.id)
      .then((result) => {
        if (!active) return;
        setProviders(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Your profiles could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return <HostSignInRequired />;

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Provider workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Your business profile</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          List your services or rental equipment on Yardly. Planners send you event details, you reply with your own
          price and terms, and you collect payment directly.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div role="status" className="mt-8 rounded-2xl bg-white px-6 py-20 text-center text-muted">
            Loading your profiles…
          </div>
        ) : (
          <>
            {providers.length > 0 && (
              <div className="mt-8 space-y-4">
                {providers.map((provider) => (
                  <article key={provider.id} className="rounded-2xl border border-border-soft bg-white p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={provider.status} />
                      <span className="text-xs text-muted">{provider.category}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">{provider.businessName}</h2>
                    <p className="mt-1 text-sm text-muted">
                      Serves {provider.serviceArea} · from ${provider.startingPrice.toLocaleString()}{" "}
                      {formatPriceUnit(provider.priceUnit)}
                    </p>
                    <p className="mt-3 text-sm leading-6">{STATUS_COPY[provider.status]}</p>
                    {provider.reviewNotes && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Review notes: {provider.reviewNotes}
                      </p>
                    )}
                    {provider.images.length === 0 && (
                      <p className="mt-3 rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
                        Add work samples before review — a profile cannot be published without at least one photo.
                      </p>
                    )}
                    <Link href="/host/quotes/" className="mt-4 inline-flex text-sm font-semibold text-brand-dark">
                      View quote requests →
                    </Link>
                  </article>
                ))}
              </div>
            )}

            <ProfileForm
              ownerId={user.id}
              hasProfile={providers.length > 0}
              onCreated={() => void load(user.id)}
              onError={setError}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProfileForm({
  ownerId,
  hasProfile,
  onCreated,
  onError,
}: {
  ownerId: string;
  hasProfile: boolean;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState<ProviderCategory>("Photography");
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [startingPrice, setStartingPrice] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [saving, setSaving] = useState(false);

  const kind = PROVIDER_CATEGORIES.find((item) => item.name === category)?.kind ?? "service";
  const priceUnit = kind === "rental" ? "item" : "event";

  async function submit(event: React.FormEvent, submitForReview: boolean) {
    event.preventDefault();

    const price = Number(startingPrice);
    if (businessName.trim().length < 2) return onError("Add your business name.");
    if (serviceArea.trim().length < 2) return onError("Add the area you serve.");
    if (!Number.isFinite(price) || price < 0) return onError("Add a starting price.");
    if (!contactEmail.trim() && !contactPhone.trim()) {
      return onError("Add an email or phone number so planners can reach you.");
    }

    const images = imageUrls
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (submitForReview && images.length === 0) {
      return onError("Add at least one work-sample image URL before submitting for review.");
    }

    setSaving(true);
    const result = await createProviderProfile(ownerId, {
      kind,
      category,
      businessName,
      tagline,
      description,
      serviceArea,
      contactEmail,
      contactPhone,
      startingPrice: price,
      priceUnit,
      images,
      submitForReview,
    });
    setSaving(false);

    if (result.error) return onError(result.error);

    setBusinessName("");
    setTagline("");
    setDescription("");
    setServiceArea("");
    setContactEmail("");
    setContactPhone("");
    setStartingPrice("");
    setImageUrls("");
    onCreated();
  }

  return (
    <section className="mt-8 rounded-2xl border border-border-soft bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold">{hasProfile ? "Add another profile" : "Create your profile"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Our team reviews every profile before it goes live. You can save a draft and come back to it.
      </p>

      <form onSubmit={(event) => void submit(event, true)} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ProviderCategory)}
            className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
          >
            {PROVIDER_CATEGORIES.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
                {item.kind === "rental" ? " (equipment rentals)" : ""}
              </option>
            ))}
          </select>
        </label>

        <TextField label="Business name" value={businessName} onChange={setBusinessName} required />
        <TextField label="Area you serve" value={serviceArea} onChange={setServiceArea} placeholder="Baltimore metro" required />
        <TextField label="Tagline (optional)" value={tagline} onChange={setTagline} className="sm:col-span-2" />

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">About your business</span>
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="At least 20 characters. Describe what you offer and how you work."
            className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
          />
        </label>

        <TextField label="Contact email" value={contactEmail} onChange={setContactEmail} type="email" />
        <TextField label="Contact phone" value={contactPhone} onChange={setContactPhone} type="tel" />

        <label className="block">
          <span className="text-sm font-semibold">
            Starting price <span className="font-normal text-muted">({formatPriceUnit(priceUnit)})</span>
          </span>
          <input
            type="number"
            required
            min={0}
            step={0.01}
            value={startingPrice}
            onChange={(event) => setStartingPrice(event.target.value)}
            className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">Work sample image URLs</span>
          <textarea
            rows={3}
            value={imageUrls}
            onChange={(event) => setImageUrls(event.target.value)}
            placeholder="One URL per line. Uploads from your device are coming in a later step."
            className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Submit for review"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={(event) => void submit(event, false)}
            className="rounded-xl border border-border-soft px-6 py-3 text-sm font-semibold transition hover:bg-surface-soft disabled:opacity-60"
          >
            Save as draft
          </button>
        </div>
      </form>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-border-soft px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const styles =
    status === "published"
      ? "bg-emerald-50 text-emerald-700"
      : status === "pending_review"
        ? "bg-sky-50 text-sky-700"
        : status === "rejected"
          ? "bg-red-50 text-red-700"
          : status === "paused"
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${styles}`}>
      {status.replace("_", " ")}
    </span>
  );
}
