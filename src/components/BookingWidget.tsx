"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Space } from "@/lib/types";
import { useStore } from "@/lib/store";

const OPEN_HOUR = 8; // 8:00 AM
const CLOSE_HOUR = 22; // 10:00 PM

function label(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

export default function BookingWidget({ space }: { space: Space }) {
  const { user, setAuthOpen, addBooking } = useStore();
  const router = useRouter();
  const [date, setDate] = useState("");
  const [fullDay, setFullDay] = useState(false);
  const [startHour, setStartHour] = useState(14); // 2 PM default
  const [hours, setHours] = useState(space.minHours);
  const [guests, setGuests] = useState(1);
  const [error, setError] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");

  // keep duration within opening hours
  const maxHours = Math.max(space.minHours, CLOSE_HOUR - startHour);
  const durationOptions = useMemo(() => {
    const opts: number[] = [];
    for (let h = space.minHours; h <= maxHours; h++) opts.push(h);
    return opts;
  }, [space.minHours, maxHours]);

  const effectiveHours = Math.min(hours, maxHours);
  const endHour = startHour + effectiveHours;

  const subtotal = fullDay ? space.dayPrice : space.hourlyPrice * effectiveHours;
  const serviceFee = Math.round(subtotal * 0.12);
  const total = subtotal + serviceFee;

  function reserve() {
    setError("");
    if (!date) return setError("Pick a date for your booking.");
    if (!user) {
      setAuthOpen(true);
      return;
    }
    addBooking({
      id: crypto.randomUUID(),
      spaceId: space.id,
      title: space.title,
      image: space.images[0],
      location: space.location,
      date,
      startTime: fullDay ? `${OPEN_HOUR}:00` : `${startHour}:00`,
      endTime: fullDay ? `${CLOSE_HOUR}:00` : `${endHour}:00`,
      hours: fullDay ? CLOSE_HOUR - OPEN_HOUR : effectiveHours,
      fullDay,
      guests,
      total,
      createdAt: new Date().toISOString(),
    });
    router.push("/bookings?booked=1");
  }

  return (
    <div className="rounded-2xl border border-border p-6 shadow-xl">
      <div className="flex items-baseline justify-between">
        <p>
          <span className="text-2xl font-semibold">${space.hourlyPrice}</span>
          <span className="text-muted"> / hour</span>
        </p>
        <span className="flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" /></svg>
          {space.rating.toFixed(2)} · <span className="text-muted underline">{space.reviews} reviews</span>
        </span>
      </div>

      {/* Hourly / Full-day toggle */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-border-soft p-1 text-sm font-medium">
        <button
          onClick={() => setFullDay(false)}
          className={`rounded-lg py-2 transition ${!fullDay ? "bg-background shadow" : "text-muted"}`}
        >
          By the hour
        </button>
        <button
          onClick={() => setFullDay(true)}
          className={`rounded-lg py-2 transition ${fullDay ? "bg-background shadow" : "text-muted"}`}
        >
          Full day · ${space.dayPrice}
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <label className="block border-b border-border px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide">Date</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

        {!fullDay && (
          <div className="grid grid-cols-2">
            <label className="border-r border-border px-3 py-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide">Start</span>
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-full bg-transparent text-sm outline-none"
              >
                {Array.from({ length: CLOSE_HOUR - OPEN_HOUR - space.minHours + 1 }, (_, i) => OPEN_HOUR + i).map((h) => (
                  <option key={h} value={h}>{label(h)}</option>
                ))}
              </select>
            </label>
            <label className="px-3 py-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide">Duration</span>
              <select
                value={effectiveHours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full bg-transparent text-sm outline-none"
              >
                {durationOptions.map((h) => (
                  <option key={h} value={h}>{h} hours</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="block border-t border-border px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide">Guests</span>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full bg-transparent text-sm outline-none"
          >
            {Array.from({ length: space.capacity }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
            ))}
          </select>
        </label>
      </div>

      {!fullDay && (
        <p className="mt-2 text-center text-xs text-muted">
          {label(startHour)} – {label(endHour)} · {space.minHours} hr minimum
        </p>
      )}

      {error && <p className="mt-3 text-sm text-brand">{error}</p>}

      <button
        onClick={reserve}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand to-brand-dark py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
      >
        Reserve
      </button>

      <div className="mt-5 space-y-3 text-sm">
        <p className="text-center text-muted">You won&apos;t be charged yet</p>
        <Row
          label={fullDay ? "Full day rate" : `$${space.hourlyPrice} × ${effectiveHours} hours`}
          value={`$${subtotal}`}
        />
        <Row label="Yardly service fee" value={`$${serviceFee}`} />
        <div className="border-t border-border-soft pt-3">
          <Row label="Total" value={`$${total}`} bold />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted"}`}>
      <span className={bold ? "" : "underline"}>{label}</span>
      <span className={bold ? "" : "text-foreground"}>{value}</span>
    </div>
  );
}
