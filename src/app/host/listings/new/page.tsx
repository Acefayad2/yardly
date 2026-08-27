"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HostNav from "@/components/HostNav";
import { useStore } from "@/lib/store";
import { SpaceType } from "@/lib/types";

const spaceTypes: SpaceType[] = ["Backyards", "Pools", "Outdoor kitchens", "Patios & decks", "Gardens", "Fire pits", "Rooftops", "Sport courts", "Event yards", "Hot tubs"];
const amenityOptions = ["Restroom access", "Wi-Fi", "Outdoor seating", "Grill", "Fire pit", "Pool", "Parking", "Speakers"];

export default function NewHostListingPage() {
  const router = useRouter();
  const { user, setAuthOpen, addHostListing } = useStore();
  const [step, setStep] = useState(1);
  const [spaceType, setSpaceType] = useState<SpaceType>("Backyards");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [hourlyPrice, setHourlyPrice] = useState("45");
  const [capacity, setCapacity] = useState("12");
  const [amenities, setAmenities] = useState<string[]>([]);
  const progress = useMemo(() => `${Math.round((step / 3) * 100)}%`, [step]);

  function toggleAmenity(amenity: string) {
    setAmenities((current) => current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (step < 3) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    addHostListing({
      id: `host-${Date.now()}`,
      title: title.trim(),
      location: location.trim(),
      spaceType,
      hourlyPrice: Number(hourlyPrice),
      capacity: Number(capacity),
      description: description.trim(),
      amenities,
      image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1200&q=85",
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    router.push("/host/listings?created=1");
  }

  return (
    <div className="min-h-screen bg-white">
      <HostNav />
      <div className="sticky top-[73px] z-20 h-1 bg-surface-soft"><div className="h-full bg-brand transition-all" style={{ width: progress }} /></div>
      <form onSubmit={submit} className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col px-6 py-10 sm:py-14">
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-dark">Step {step} of 3</p>
          {step === 1 && (
            <section className="animate-fade-in">
              <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">What kind of space will you share?</h1>
              <p className="mt-3 text-muted">Choose the option that best describes the main experience guests will book.</p>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {spaceTypes.map((type) => (
                  <button key={type} type="button" onClick={() => setSpaceType(type)} className={`min-h-24 rounded-2xl border p-4 text-left text-sm font-semibold transition ${spaceType === type ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-border-soft hover:border-muted"}`}>
                    <span className="mb-4 block text-2xl" aria-hidden="true">{iconForType(type)}</span>{type}
                  </button>
                ))}
              </div>
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
                <Field label="Location" hint="City and state are enough for now">
                  <input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Towson, MD" className="host-input" />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Hourly price">
                    <div className="relative"><span className="absolute left-4 top-3.5 font-semibold">$</span><input required min="10" max="1000" type="number" value={hourlyPrice} onChange={(event) => setHourlyPrice(event.target.value)} className="host-input pl-8" /></div>
                  </Field>
                  <Field label="Guest capacity">
                    <input required min="1" max="200" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="host-input" />
                  </Field>
                </div>
                <Field label="Description" hint="Tell guests what makes the space special">
                  <textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={600} placeholder="A private, peaceful space made for..." className="host-input resize-none" />
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
              <div className="mt-8 rounded-2xl bg-surface-soft p-5">
                <p className="font-semibold">Your listing will be saved as a draft</p>
                <p className="mt-1 text-sm leading-6 text-muted">Next, add photos, availability, arrival instructions, and house rules before you publish.</p>
              </div>
            </section>
          )}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-border-soft pt-6">
          {step > 1 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="text-sm font-semibold underline underline-offset-4">Back</button> : <span />}
          <button type="submit" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark">
            {step === 3 ? "Save draft" : "Continue"}
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
