"use client";

import { useState } from "react";
import { FLEX_DAYS, flexibleLabel, type FlexibleSearch, searchDateLabel, validSearchDate } from "@/lib/search-dates";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SearchCalendar({ value, onChange, flexibility = 0, onFlexibility, flexible, onFlexible }: { value: string; onChange: (value: string) => void; flexibility?: number; onFlexibility?: (value: number) => void; flexible?: FlexibleSearch; onFlexible?: (value: FlexibleSearch | undefined) => void }) {
  const [today] = useState(() => dateKey(new Date()));
  const [month, setMonth] = useState(() => {
    const initial = validSearchDate(value) && value >= today ? new Date(`${value}T12:00:00`) : new Date(`${today}T12:00:00`);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const previousDisabled = dateKey(month).slice(0, 7) <= today.slice(0, 7);
  function setFlex(days: number) {
    onFlexibility?.(days);
    if (days && !value) onChange(today);
  }
  return (
    <div className="search-calendar">
      {onFlexibility && <div className="search-date-tabs" role="group" aria-label="Date search mode">
        <span aria-hidden="true" style={{ transform: `translateX(${flexible ? 100 : 0}%)` }} />
        <button type="button" aria-pressed={!flexible} onClick={() => onFlexible?.(undefined)}>Dates</button>
        <button type="button" aria-pressed={!!flexible} onClick={() => { onFlexible?.(flexible ?? { month: today.slice(0, 7), days: "any" }); onChange(""); onFlexibility?.(0); }}>Flexible</button>
      </div>}
      {flexible ? <div className="search-flexible">
        <div className="search-calendar__intro"><strong>Find a day that fits</strong><p>Choose a month and the days that work for you. Every booking is by the hour, within one day.</p></div>
        <div className="search-date-tolerance" role="group" aria-label="Preferred days">
          {([ ["any", "Any day"], ["weekdays", "Weekdays"], ["weekends", "Weekends"] ] as const).map(([days, label]) => <button key={days} type="button" aria-pressed={flexible.days === days} onClick={() => onFlexible?.({ ...flexible, days })}>{label}</button>)}
        </div>
        <h3>Which month works for you?</h3>
        <div className="search-flexible__months" role="group" aria-label="Preferred month">
          {Array.from({ length: 12 }, (_, index) => {
            const current = new Date(`${today}T12:00:00`);
            current.setDate(1); current.setMonth(current.getMonth() + index);
            const key = dateKey(current).slice(0, 7);
            const label = current.toLocaleDateString(undefined, { month: "long", year: "numeric" });
            return <button type="button" key={key} aria-label={label} aria-pressed={flexible.month === key} onClick={() => onFlexible?.({ ...flexible, month: key })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></svg>
              <strong>{current.toLocaleDateString(undefined, { month: "long" })}</strong><span>{current.getFullYear()}</span>
            </button>;
          })}
        </div>
      </div> : <>
      <div className="search-calendar__intro"><strong>{flexibility ? "A little room to plan" : "Make a day of it"}</strong><p>{flexibility ? "Choose a preferred day. We’ll look for one available day nearby." : "Choose one day. Book your hours at the space."}</p></div>
      <div className="search-calendar__navigation">
        <button type="button" aria-label="Previous month" disabled={previousDisabled} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="search-calendar__months">
        {[0, 1].map((offset) => {
          const current = new Date(month.getFullYear(), month.getMonth() + offset, 1);
          const count = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
          const title = current.toLocaleDateString(undefined, { month: "long", year: "numeric" });
          return <section key={offset} className="search-calendar__month" aria-label={title}>
            <h3 aria-live="polite">{title}</h3>
            <div className="search-calendar__days">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <small key={`weekday-${index}`} aria-hidden="true">{day}</small>)}
              {Array.from({ length: current.getDay() }, (_, index) => <i key={`blank-${index}`} />)}
              {Array.from({ length: count }, (_, index) => {
                const day = new Date(current.getFullYear(), current.getMonth(), index + 1);
                const key = dateKey(day);
                return <button type="button" key={key} disabled={key < today} aria-pressed={key === value} aria-current={key === today ? "date" : undefined} aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} onClick={() => onChange(key)}>{index + 1}</button>;
              })}
            </div>
          </section>;
        })}
      </div>
      {onFlexibility && <div className="search-date-tolerance" role="group" aria-label="Date flexibility">{FLEX_DAYS.map((days) => <button key={days} type="button" aria-pressed={flexibility === days} onClick={() => setFlex(days)}>{days ? `± ${days} ${days === 1 ? "day" : "days"}` : "Exact date"}</button>)}</div>}
      </>}
      <div className="search-calendar__selection"><p aria-live="polite">{flexible ? flexibleLabel(flexible) : value ? searchDateLabel(value, flexibility) : "No date selected"}</p><button type="button" onClick={() => { onChange(""); onFlexibility?.(0); onFlexible?.(undefined); }} disabled={!value && !flexible}>Clear date</button></div>
    </div>
  );
}
