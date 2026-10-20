"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import HostNav from "@/components/HostNav";
import AddressMapPicker from "@/components/AddressMapPicker";
import type { AddressSuggestion } from "@/lib/geocoding";
import { ListingImagePlanEntry, SpaceType } from "@/lib/types";
import { useConfirmLeave } from "@/lib/useConfirmLeave";

const spaceTypes: SpaceType[] = ["Backyards", "Pools", "Outdoor kitchens", "Patios & decks", "Gardens", "Fire pits", "Rooftops", "Sport courts", "Event yards", "Hot tubs"];
const amenityOptions = ["Restroom access", "Wi-Fi", "Outdoor seating", "Grill", "Fire pit", "Pool", "Parking", "Speakers"];
const timezoneOptions = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Arizona Time"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Anchorage", "Alaska Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
] as const;

export interface HostListingFormValues {
  spaceType: SpaceType;
  title: string;
  location: string;
  neighborhood: string;
  description: string;
  hourlyPrice: string;
  minHours: string;
  capacity: string;
  latitude: string;
  longitude: string;
  streetAddress: string;
  timezone: string;
  rules: string;
  amenities: string[];
}

export type HostListingSubmitResult = { error?: string; message?: string; id?: string };
type UploadProgress = (done: number, total: number) => void;

interface HostListingFormProps {
  mode: "create" | "edit";
  initialValues?: Partial<HostListingFormValues>;
  existingImages?: string[];
  submitLabel: string;
  onSubmit: (values: HostListingFormValues, imagePlan: ListingImagePlanEntry[], onProgress?: UploadProgress) => Promise<HostListingSubmitResult>;
  buildRedirect: (result: HostListingSubmitResult) => string;
}

const emptyValues: HostListingFormValues = {
  spaceType: "Backyards",
  title: "",
  location: "",
  neighborhood: "",
  description: "",
  hourlyPrice: "45",
  minHours: "2",
  capacity: "12",
  latitude: "",
  longitude: "",
  streetAddress: "",
  timezone: "America/New_York",
  rules: "",
  amenities: [],
};

// One combined, host-ordered list -- already-uploaded photos and newly picked local
// files live in the same array so reordering (including making a new photo the cover)
// is a single, uniform operation instead of two separate ones.
type PendingImage =
  | { key: string; kind: "existing"; url: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export default function HostListingForm({ mode, initialValues, existingImages = [], submitLabel, onSubmit, buildRedirect }: HostListingFormProps) {
  const router = useRouter();
  const base = { ...emptyValues, ...initialValues };
  const [step, setStep] = useState(1);
  const [spaceType, setSpaceType] = useState<SpaceType>(base.spaceType);
  const [title, setTitle] = useState(base.title);
  const [location, setLocation] = useState(base.location);
  const [neighborhood, setNeighborhood] = useState(base.neighborhood);
  const [description, setDescription] = useState(base.description);
  const [hourlyPrice, setHourlyPrice] = useState(base.hourlyPrice);
  const [minHours, setMinHours] = useState(base.minHours);
  const [capacity, setCapacity] = useState(base.capacity);
  const [latitude, setLatitude] = useState(base.latitude);
  const [longitude, setLongitude] = useState(base.longitude);
  const [streetAddress, setStreetAddress] = useState(base.streetAddress);
  // Prefer the real stored street address for the picker's preview label. Listings saved
  // before private addresses existed have none on file — fall back to the public city/state
  // so the map still centers, but the host must choose a real address again to save it.
  const [address, setAddress] = useState<AddressSuggestion | null>(base.latitude && base.longitude ? {
    id: "existing", label: base.streetAddress || [base.neighborhood, base.location].filter(Boolean).join(", "),
    publicLocation: base.location, neighborhood: base.neighborhood,
    latitude: Number(base.latitude), longitude: Number(base.longitude),
  } : null);
  const [timezone, setTimezone] = useState(base.timezone);
  const [rules, setRules] = useState(base.rules);
  const [amenities, setAmenities] = useState<string[]>(base.amenities);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>(() => existingImages.map((url) => ({ key: url, kind: "existing" as const, url })));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const progress = useMemo(() => `${Math.round((step / 3) * 100)}%`, [step]);

  // Revoke local preview URLs for whatever is still pending at true unmount, not just
  // what was pending at mount -- a plain [] dep effect would only ever see the initial,
  // empty (existing-only) list. The ref is kept current in its own effect (never written
  // during render) purely so the unmount cleanup below can read the latest value.
  const pendingImagesRef = useRef(pendingImages);
  useEffect(() => { pendingImagesRef.current = pendingImages; }, [pendingImages]);
  useEffect(() => () => {
    pendingImagesRef.current.forEach((item) => { if (item.kind === "new") URL.revokeObjectURL(item.previewUrl); });
  }, []);

  // A host can lose everything typed -- including selected photos -- to one accidental
  // browser Back tap, since this wizard keeps its state only in memory. `dirty` flips true on
  // the first change to any tracked field after mount and never resets; it drives both guards
  // below. Submitting navigates away via router.push, which doesn't fire popstate/beforeunload,
  // so a successful save is never blocked by either guard.
  const [dirty, setDirty] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setDirty(true);
  }, [spaceType, title, location, neighborhood, description, hourlyPrice, minHours, capacity, latitude, longitude, streetAddress, timezone, rules, amenities, pendingImages]);

  useConfirmLeave(dirty, "Leave without saving this listing? Your changes will be lost.");

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function toggleAmenity(amenity: string) {
    setAmenities((current) => current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]);
  }

  function addPhotos(files: File[]) {
    if (!files.length) return;
    if (pendingImages.length + files.length > MAX_IMAGES) {
      setSaveError(`A listing can have up to ${MAX_IMAGES} photos. Choose fewer files.`);
      return;
    }
    if (files.some((file) => file.size > MAX_IMAGE_BYTES || !ACCEPTED_IMAGE_TYPES.includes(file.type))) {
      setSaveError("Choose JPG, PNG, WebP, or HEIC photos no larger than 10 MB each.");
      return;
    }
    setSaveError("");
    setPendingImages((current) => [
      ...current,
      ...files.map((file) => ({ key: crypto.randomUUID(), kind: "new" as const, file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function removeImage(key: string) {
    setPendingImages((current) => {
      const target = current.find((item) => item.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }

  function moveImage(key: string, direction: -1 | 1) {
    setPendingImages((current) => {
      const index = current.findIndex((item) => item.key === key);
      const swapWith = index + direction;
      if (index === -1 || swapWith < 0 || swapWith >= current.length) return current;
      const next = [...current];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 2 && !address) {
      setSaveError("Choose an address from the suggestions to place your space on the map.");
      document.getElementById("listing-address")?.focus();
      return;
    }
    if (step < 3) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    setSaveError("");
    setUploadProgress(null);
    const imagePlan: ListingImagePlanEntry[] = pendingImages.map((item) =>
      item.kind === "existing" ? { kind: "existing", url: item.url } : { kind: "new", file: item.file },
    );
    const result = await onSubmit(
      {
        spaceType,
        title: title.trim(),
        location: location.trim(),
        neighborhood: neighborhood.trim(),
        description: description.trim(),
        hourlyPrice,
        minHours,
        capacity,
        latitude,
        longitude,
        streetAddress: streetAddress.trim(),
        timezone,
        rules,
        amenities,
      },
      imagePlan,
      (done, total) => setUploadProgress({ done, total }),
    );
    setSaving(false);
    setUploadProgress(null);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    router.push(buildRedirect(result));
  }

  const previewCoverUrl = pendingImages[0] ? (pendingImages[0].kind === "existing" ? pendingImages[0].url : pendingImages[0].previewUrl) : null;
  const rulesList = rules.split("\n").map((rule) => rule.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-white">
      <HostNav />
      <div className="sticky top-[73px] z-20 h-1 bg-surface-soft"><div className="h-full bg-brand transition-all" style={{ width: progress }} /></div>
      <form onSubmit={submit} className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col px-6 py-10 sm:py-14">
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-dark">{mode === "edit" ? "Editing listing" : ""} Step {step} of 3</p>
          {step === 1 && (
            <section className="animate-fade-in">
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">{mode === "edit" ? "Update the space basics" : "What kind of space will you share?"}</h1>
              <p className="mt-3 text-muted">Choose the option that best describes the main experience guests will book.</p>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {spaceTypes.map((type) => (
                  <button key={type} type="button" onClick={() => setSpaceType(type)} className={`min-h-24 rounded-2xl border p-4 text-left text-sm font-semibold transition ${spaceType === type ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-border-soft hover:border-muted"}`}>
                    <span className="mb-4 block text-2xl" aria-hidden="true">{iconForType(type)}</span>{type}
                  </button>
                ))}
              </div>
              <label className="mt-8 block rounded-2xl border border-dashed border-border-soft bg-surface-soft p-5">
                <span className="font-semibold">{pendingImages.length ? "Add more photos" : "Add photos"}</span>
                <span className="mt-1 block text-sm leading-6 text-muted">Upload up to {MAX_IMAGES} JPG, PNG, WebP, or HEIC images. Each photo can be up to 10 MB. Drag to reorder — the first photo is the cover.</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  onChange={(event) => {
                    addPhotos(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                  className="mt-4 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
                />
              </label>
              {pendingImages.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {pendingImages.map((item, index) => (
                    <li key={item.key} className="group relative overflow-hidden rounded-xl border border-border-soft">
                      <Image
                        src={item.kind === "existing" ? item.url : item.previewUrl}
                        alt={index === 0 ? "Cover photo" : `Photo ${index + 1}`}
                        width={200}
                        height={150}
                        unoptimized={item.kind === "new"}
                        className="h-24 w-full object-cover sm:h-28"
                      />
                      {index === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[0.65rem] font-semibold text-white">Cover</span>}
                      <button type="button" onClick={() => removeImage(item.key)} aria-label={`Remove photo ${index + 1}`} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs font-bold text-white">✕</button>
                      <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                        <button type="button" disabled={index === 0} onClick={() => moveImage(item.key, -1)} aria-label={`Move photo ${index + 1} earlier`} className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs font-bold text-white disabled:opacity-30">↑</button>
                        <button type="button" disabled={index === pendingImages.length - 1} onClick={() => moveImage(item.key, 1)} aria-label={`Move photo ${index + 1} later`} className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs font-bold text-white disabled:opacity-30">↓</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-in">
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">Give guests the essentials</h1>
              <p className="mt-3 text-muted">You can add photos, detailed rules, and availability before publishing.</p>
              <div className="mt-8 space-y-5">
                <Field label="Listing title" hint="Make it clear and memorable">
                  <input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={70} placeholder="Sunny garden with dining patio" className="host-input" />
                </Field>
                <AddressMapPicker selected={address} onSelect={(next) => {
                  setAddress(next);
                  setSaveError("");
                  setLocation(next?.publicLocation ?? "");
                  setNeighborhood(next?.neighborhood ?? "");
                  setLatitude(next ? String(Math.round(next.latitude * 100) / 100) : "");
                  setLongitude(next ? String(Math.round(next.longitude * 100) / 100) : "");
                  setStreetAddress(next?.label ?? "");
                }} />
                <Field label="Local timezone" hint="Booking hours are shown in the space's local time">
                  <select required value={timezone} onChange={(event) => setTimezone(event.target.value)} className="host-input">
                    {timezoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Hourly price">
                    <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-muted">$</span><input required min="10" max="1000" type="number" value={hourlyPrice} onChange={(event) => setHourlyPrice(event.target.value)} className="host-input pl-9" /></div>
                  </Field>
                  <Field label="Guest capacity">
                    <input required min="1" max="200" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="host-input" />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Minimum hours">
                    <input required min="1" max="14" type="number" value={minHours} onChange={(event) => setMinHours(event.target.value)} className="host-input" />
                  </Field>
                </div>
                <Field label="Description" hint="Tell guests what makes the space special (at least 20 characters)">
                  <textarea required minLength={20} value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={600} placeholder="A private, peaceful space made for..." className="host-input resize-none" />
                </Field>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="animate-fade-in">
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">What does your space offer?</h1>
              <p className="mt-3 text-muted">Select everything guests can use. You can update this later.</p>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {amenityOptions.map((amenity) => (
                  <button key={amenity} type="button" onClick={() => toggleAmenity(amenity)} className={`rounded-2xl border px-4 py-5 text-left text-sm font-semibold transition ${amenities.includes(amenity) ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-border-soft hover:border-muted"}`}>
                    <span className={`mb-3 grid h-6 w-6 place-items-center rounded-full border text-xs ${amenities.includes(amenity) ? "border-brand bg-brand text-white" : "border-border-soft"}`}>{amenities.includes(amenity) ? "✓" : "+"}</span>
                    {amenity}
                  </button>
                ))}
              </div>
              <Field label="Space rules" hint="Put one rule on each line">
                <textarea required value={rules} onChange={(event) => setRules(event.target.value)} rows={5} maxLength={1000} placeholder={"No smoking\nQuiet hours after 9 PM\nNo glass near the pool"} className="host-input mt-2 resize-none" />
              </Field>

              <div className="mt-8 rounded-2xl border border-border-soft p-5">
                <p className="font-semibold">Preview</p>
                <p className="mt-1 text-sm leading-6 text-muted">A simplified version of what guests will see. Booking and messaging aren&apos;t part of this preview.</p>
                <div className="mt-4 overflow-hidden rounded-xl border border-border-soft">
                  {previewCoverUrl ? (
                    <Image src={previewCoverUrl} alt="" width={640} height={360} unoptimized className="h-40 w-full object-cover sm:h-52" />
                  ) : (
                    <div className="grid h-40 place-items-center bg-surface-soft text-sm text-muted sm:h-52">No photos added yet</div>
                  )}
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{spaceType}</p>
                    <h2 className="mt-1 text-lg font-semibold">{title || "Untitled listing"}</h2>
                    <p className="mt-1 text-sm text-muted">{[neighborhood, location].filter(Boolean).join(", ") || "Location not set"}</p>
                    <p className="mt-2 text-sm font-semibold">${hourlyPrice || "0"}/hour · Up to {capacity || "0"} guests · {minHours || "0"}h minimum</p>
                    {description && <p className="mt-3 text-sm leading-6 text-foreground/80">{description}</p>}
                    {amenities.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {amenities.map((amenity) => <span key={amenity} className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium">{amenity}</span>)}
                      </div>
                    )}
                    {rulesList.length > 0 && (
                      <ul className="mt-3 list-inside list-disc text-sm text-muted">
                        {rulesList.map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-surface-soft p-5">
                <p className="font-semibold">{mode === "edit" ? "Changes are saved to your listing" : "Your listing will be saved as a draft"}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{mode === "edit" ? "Your current publication status stays unchanged. Updates to a published listing are visible to guests." : "Review your photos and rules, then set availability from Listings before publishing."}</p>
              </div>
            </section>
          )}
        </div>

        {saveError && <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>}
        <div className="mt-10 flex items-center justify-between border-t border-border-soft pt-6">
          {step > 1 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="text-sm font-semibold underline underline-offset-4">Back</button> : <span />}
          <button type="submit" disabled={saving} className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
            {uploadProgress && uploadProgress.total > 0 ? `Uploading photo ${uploadProgress.done} of ${uploadProgress.total}…` : saving ? "Saving…" : step === 3 ? submitLabel : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold">{label}</span>{hint && <span className="ml-2 text-xs text-muted">{hint}</span>}<div className="mt-2">{children}</div></label>;
}

function iconForType(type: SpaceType) {
  const icons: Record<SpaceType, string> = { Backyards: "🏡", Pools: "💧", "Outdoor kitchens": "🍽️", "Patios & decks": "☀️", Gardens: "🌿", "Fire pits": "🔥", Rooftops: "🌇", "Sport courts": "🏀", "Event yards": "🎉", "Hot tubs": "♨️" };
  return icons[type];
}
