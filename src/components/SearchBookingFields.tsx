"use client";

import { useEffect, useId, useRef } from "react";
import SearchCalendar from "./SearchCalendar";

export default function SearchBookingFields({ date, guests, onDate, onGuests, open, setOpen }: { date: string; guests: string; onDate: (value: string) => void; onGuests: (value: string) => void; open: "when" | "who" | null; setOpen: (value: "when" | "who" | null) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const when = useRef<HTMLButtonElement>(null);
  const who = useRef<HTMLButtonElement>(null);
  const id = useId();
  const count = Math.min(60, Math.max(0, Number(guests) || 0));
  function close() { (open === "when" ? when : who).current?.focus(); setOpen(null); }
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("pointerdown", outside); };
  }, [setOpen]);
  return <div className="search-booking-fields" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null); }} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <input type="hidden" name="date" value={date} /><input type="hidden" name="guests" value={guests} />
    <button ref={when} type="button" className="header-search__field search-field-trigger" aria-expanded={open === "when"} aria-controls={`${id}-when`} onClick={() => setOpen(open === "when" ? null : "when")}><span>When</span><p>{date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Add a date"}</p></button>
    {open === "when" && <section id={`${id}-when`} className="search-booking-panel search-booking-panel--date" aria-label="Choose a booking date"><SearchCalendar value={date} onChange={onDate} /><div className="search-booking-panel__footer"><button type="button" onClick={() => { setOpen("who"); who.current?.focus(); }}>Next: guests →</button></div></section>}
    <button ref={who} type="button" className="header-search__field search-field-trigger" aria-expanded={open === "who"} aria-controls={`${id}-who`} onClick={() => setOpen(open === "who" ? null : "who")}><span>Who</span><p>{count ? `${count} ${count === 1 ? "guest" : "guests"}` : "Add guests"}</p></button>
    {open === "who" && <section id={`${id}-who`} className="search-booking-panel search-booking-panel--guests" aria-label="Choose guests">
      <h2>Who’s coming?</h2><p className="search-booking-panel__hint">Bring your favorite people.</p>
      <div className="search-guest-row"><div><strong>Guests</strong><p>Include everyone attending</p></div><div className="search-guest-stepper"><button type="button" aria-label="Remove guest" disabled={count === 0} onClick={() => onGuests(count <= 1 ? "" : String(count - 1))}>−</button><output aria-live="polite">{count}</output><button type="button" aria-label="Add guest" disabled={count === 60} onClick={() => onGuests(String(count + 1))}>+</button></div></div>
      <p className="search-booking-panel__note">Each space sets its own capacity and rules for children and pets.</p><div className="search-booking-panel__footer"><button type="button" onClick={close}>Done</button></div>
    </section>}
  </div>;
}
