"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type SearchStep = "where" | "when" | "who";

const destinations = [
  { icon: "⌁", title: "Nearby", description: "See spaces around you", value: "" },
  { icon: "☀", title: "Los Angeles, CA", description: "Pools and private backyards", value: "Los Angeles" },
  { icon: "♨", title: "Austin, TX", description: "Outdoor kitchens and patios", value: "Austin" },
  { icon: "≈", title: "Miami, FL", description: "Tropical pools and event yards", value: "Miami" },
];

export default function MobileSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SearchStep>("where");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(1);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function clearAll() {
    setQuery("");
    setDate("");
    setGuests(1);
    setStep("where");
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (date) params.set("date", date);
    if (guests > 1) params.set("guests", String(guests));
    setOpen(false);
    router.push(params.size ? `/?${params.toString()}#discover` : "/#discover");
  }

  function continueToGuests(event: React.MouseEvent<HTMLButtonElement>) {
    const dateInput = event.currentTarget.form?.querySelector<HTMLInputElement>(".mobile-search-date input");
    if (dateInput?.value) setDate(dateInput.value);
    setStep("who");
  }

  const overlay = open ? (
    <div className="mobile-search-overlay lg:hidden" role="dialog" aria-modal="true" aria-label="Search Yardly">
      <form className="mobile-search-sheet" onSubmit={submitSearch}>
        <div className="mobile-search-sheet__topbar">
          <div className="mobile-search-tabs" aria-label="Space categories">
            <span className="mobile-search-tab mobile-search-tab--active"><b aria-hidden="true">⌂</b>Spaces</span>
            <span className="mobile-search-tab"><b aria-hidden="true">≈</b>Pools</span>
            <span className="mobile-search-tab"><b aria-hidden="true">✦</b>Events</span>
          </div>
          <button type="button" className="mobile-search-close" onClick={() => setOpen(false)} aria-label="Close search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="mobile-search-sheet__sections">
          {step === "where" ? (
            <section className="mobile-search-card" aria-labelledby="mobile-search-where">
              <h2 id="mobile-search-where">Where?</h2>
              <label className="mobile-search-location">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cities or neighborhoods" aria-label="Search cities or neighborhoods" />
              </label>
              <p className="mobile-search-card__label">Suggested destinations</p>
              <div className="mobile-destinations">
                {destinations.map((destination) => (
                  <button
                    key={destination.title}
                    type="button"
                    onClick={() => { setQuery(destination.value); setStep("when"); }}
                    className="mobile-destination"
                  >
                    <span className="mobile-destination__icon" aria-hidden="true">{destination.icon}</span>
                    <span><strong>{destination.title}</strong><small>{destination.description}</small></span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <CollapsedSection label="Where" value={query || "Add a destination"} onClick={() => setStep("where")} />
          )}

          {step === "when" ? (
            <section className="mobile-search-card mobile-search-card--compact" aria-labelledby="mobile-search-when">
              <h2 id="mobile-search-when">When?</h2>
              <label className="mobile-search-date">
                <span>Choose a date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Booking date" />
              </label>
              <button type="button" className="mobile-search-next" onClick={continueToGuests}>Next: guests</button>
            </section>
          ) : (
            <CollapsedSection label="When" value={date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Add a date"} onClick={() => setStep("when")} />
          )}

          {step === "who" ? (
            <section className="mobile-search-card mobile-search-card--compact" aria-labelledby="mobile-search-who">
              <h2 id="mobile-search-who">Who?</h2>
              <div className="mobile-guest-control">
                <div><strong>Guests</strong><span>How many people are coming?</span></div>
                <div className="mobile-guest-stepper">
                  <button type="button" onClick={() => setGuests((count) => Math.max(1, count - 1))} disabled={guests === 1} aria-label="Remove guest">−</button>
                  <output aria-live="polite">{guests}</output>
                  <button type="button" onClick={() => setGuests((count) => Math.min(60, count + 1))} disabled={guests === 60} aria-label="Add guest">+</button>
                </div>
              </div>
            </section>
          ) : (
            <CollapsedSection label="Who" value={guests > 1 ? `${guests} guests` : "Add guests"} onClick={() => setStep("who")} />
          )}
        </div>

        <div className="mobile-search-actions">
          <button type="button" onClick={clearAll} className="mobile-search-clear">Clear all</button>
          <button type="submit" className="mobile-search-submit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
            Search
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="mobile-search-trigger lg:hidden" onClick={() => { setStep("where"); setOpen(true); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
        <span>Start your search</span>
      </button>
      {typeof document !== "undefined" && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}

function CollapsedSection({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="mobile-search-collapsed" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}
