"use client";

import { useState } from "react";
import { FLEX_DAYS, searchDateLabel, validSearchDate } from "@/lib/search-dates";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SearchCalendar({ value, onChange, flexibility = 0, onFlexibility }: { value: string; onChange: (value: string) => void; flexibility?: number; onFlexibility?: (value: number) => void }) {
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
        <span aria-hidden="true" style={{ transform: `translateX(${flexibility ? 100 : 0}%)` }} />
        <button type="button" aria-pressed={!flexibility} onClick={() => setFlex(0)}>Dates</button>
        <button type="button" aria-pressed={!!flexibility} onClick={() => setFlex(flexibility || 3)}>Flexible</button>
      </div>}
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
      <div className="search-calendar__selection"><p aria-live="polite">{value ? searchDateLabel(value, flexibility) : "No date selected"}</p><button type="button" onClick={() => { onChange(""); onFlexibility?.(0); }} disabled={!value}>Clear date</button></div>
    </div>
  );
}
