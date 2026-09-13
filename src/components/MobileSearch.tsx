"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import DestinationSearch from "./DestinationSearch";
import SearchCalendar from "./SearchCalendar";
import { parseFlex, searchDateLabel } from "@/lib/search-dates";

type SearchStep = "where" | "when" | "who";

export default function MobileSearch() {
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SearchStep>("where");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [flexibility, setFlexibility] = useState(0);
  const [guests, setGuests] = useState(1);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(".mobile-search-card input, .mobile-search-card button:not([disabled])")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const previousTrigger = trigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input') ?? []);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousTrigger?.focus();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function clearAll() {
    setQuery("");
    setDate("");
    setFlexibility(0);
    setGuests(1);
    setStep("where");
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (date) params.set("date", date);
    if (date && flexibility) params.set("flex", String(flexibility));
    if (guests > 1) params.set("guests", String(guests));
    setOpen(false);
    router.push(params.size ? `/?${params.toString()}#discover` : "/#discover");
  }

  const overlay = open ? (
    <div ref={dialog} className="mobile-search-overlay lg:hidden" role="dialog" aria-modal="true" aria-label="Search Yardly">
      <form className="mobile-search-sheet" onSubmit={submitSearch}>
        <div className="mobile-search-sheet__topbar">
          <p className="search-sheet-title">Find your outdoor space</p>
          <button type="button" className="mobile-search-close" onClick={() => setOpen(false)} aria-label="Close search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="mobile-search-sheet__sections">
          {step === "where" ? (
            <section className="mobile-search-card" aria-labelledby="mobile-search-where">
              <h2 id="mobile-search-where">Where?</h2>
              <DestinationSearch autoFocus value={query} onChange={setQuery} onChoose={() => setStep("when")} />
            </section>
          ) : (
            <CollapsedSection label="Where" value={query || "Add a destination"} onClick={() => setStep("where")} />
          )}

          {step === "when" ? (
            <section className="mobile-search-card mobile-search-card--compact" aria-labelledby="mobile-search-when">
              <h2 id="mobile-search-when">When?</h2>
              <SearchCalendar value={date} onChange={setDate} flexibility={flexibility} onFlexibility={setFlexibility} />
              <button type="button" className="mobile-search-next" onClick={() => setStep("who")}>Next: guests</button>
            </section>
          ) : (
            <CollapsedSection label="When" value={searchDateLabel(date, flexibility)} onClick={() => setStep("when")} />
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
      <button ref={trigger} type="button" className="mobile-search-trigger lg:hidden" onClick={() => {
        const params = new URLSearchParams(window.location.search);
        setQuery(params.get("q") ?? "");
        setDate(params.get("date") ?? "");
        setFlexibility(parseFlex(params.get("flex")));
        setGuests(Math.min(60, Math.max(1, Number(params.get("guests")) || 1)));
        setStep("where"); setOpen(true);
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
        <span>Start your search</span>
      </button>
      {typeof document !== "undefined" && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}

function CollapsedSection({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="mobile-search-collapsed" onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}
