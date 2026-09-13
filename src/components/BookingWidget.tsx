"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bookingQuote, listingToday } from "@/lib/booking";
import { hourLabel as label, type BookingSlot } from "@/lib/availability";
import { getSupabase } from "@/lib/supabase";
import { Space } from "@/lib/types";
import { useStore } from "@/lib/store";

export default function BookingWidget({ space }: { space: Space }) {
  const { user, setAuthOpen, addBooking } = useStore();
  const router = useRouter();
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(8);
  const [hours, setHours] = useState(space.minHours);
  const [guests, setGuests] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<{ date: string; slots: BookingSlot[]; error: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  const today = listingToday(space.timezone);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const plannedDate = params.get("date");
      const plannedGuests = Math.min(space.capacity, Math.max(1, Number(params.get("guests") ?? "1") || 1));
      if (plannedDate) setDate(plannedDate);
      setGuests(plannedGuests);
    });
  }, [space.capacity]);

  useEffect(() => {
    let cancelled = false;
    if (!date || space.isDemo) return;
    async function load() {
      try {
        const { data, error } = await getSupabase().rpc("get_booking_slots", { p_listing_id: space.id, p_booking_date: date });
        if (error) throw error;
        if (!cancelled) setAvailability({ date, slots: data ?? [], error: "" });
      } catch {
        if (!cancelled) setAvailability({ date, slots: [], error: "We couldn’t check availability. Please try again." });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [date, space.id, space.isDemo, refresh]);

  const loadingSlots = !!date && !space.isDemo && availability?.date !== date;
  const slots = availability?.date === date ? availability.slots : [];
  const slotError = availability?.date === date ? availability.error : "";
  const startOptions = [...new Set(slots.map((slot) => slot.start_hour))];
  const effectiveStart = startOptions.includes(startHour) ? startHour : startOptions[0] ?? 8;
  const durationOptions = slots.filter((slot) => slot.start_hour === effectiveStart).map((slot) => slot.end_hour - effectiveStart);
  const effectiveHours = durationOptions.includes(hours) ? hours : durationOptions[0] ?? space.minHours;
  const endHour = effectiveStart + effectiveHours;
  const canReserve = !!date && slots.length > 0 && !loadingSlots && !slotError && date >= today;

  function refreshSlots() { setAvailability(null); setRefresh((value) => value + 1); }

  const { subtotal, serviceFee, total } = bookingQuote(space.hourlyPrice, effectiveHours);

  async function reserve() {
    setError("");
    if (!date) return setError("Pick a date for your booking.");
    if (!canReserve) return setError("Choose an available time before reserving.");
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSubmitting(true);
    const result = await addBooking({
      spaceId: space.id,
      date,
      startTime: `${String(effectiveStart).padStart(2, "0")}:00`,
      endTime: `${String(endHour).padStart(2, "0")}:00`,
      guests,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      refreshSlots();
      return;
    }
    router.push("/bookings?booked=1");
  }

  return (
    <div id="booking" className="scroll-mt-28 rounded-2xl border border-border bg-background p-6 shadow-xl shadow-foreground/10">
      {space.isDemo && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
          Preview listing — reservations are unavailable.
        </p>
      )}
      <div className="flex items-baseline justify-between">
        <p>
          <span className="text-2xl font-semibold">${space.hourlyPrice}</span>
          <span className="text-muted"> / hour</span>
        </p>
        <span className="flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" /></svg>
          {space.reviews ? space.rating.toFixed(2) : "New"} · <span className="text-muted underline">{space.reviews ? `${space.reviews} reviews` : "No reviews yet"}</span>
        </span>
      </div>

      <p className="mt-4 rounded-xl bg-surface-soft px-3 py-2.5 text-xs font-medium text-muted">
        Book by the hour on one date. Times are in {space.timezone.replaceAll("_", " ")}. Choose a date to see the host’s available hours.
      </p>

      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <label className="block border-b border-border px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide">Date</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => { setDate(e.target.value); setError(""); setAvailability(null); }}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

          <div className="grid grid-cols-2">
            <label className="border-r border-border px-3 py-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide">Start</span>
              <select
                value={slots.length ? effectiveStart : ""}
                disabled={!canReserve}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-full bg-transparent text-sm outline-none"
              >
                {!slots.length && <option value="">Choose a date</option>}
                {startOptions.map((h) => (
                  <option key={h} value={h}>{label(h)}</option>
                ))}
              </select>
            </label>
            <label className="px-3 py-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wide">Duration</span>
              <select
                value={slots.length ? effectiveHours : ""}
                disabled={!canReserve}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full bg-transparent text-sm outline-none"
              >
                {!slots.length && <option value="">—</option>}
                {durationOptions.map((h) => (
                  <option key={h} value={h}>{h} hours</option>
                ))}
              </select>
            </label>
          </div>

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

      {loadingSlots && <p role="status" className="mt-3 text-sm text-muted">Checking available hours…</p>}
      {slotError && <p role="alert" className="mt-3 text-sm text-red-700">{slotError} <button type="button" onClick={refreshSlots} className="font-semibold underline">Retry availability</button></p>}
      {date && !loadingSlots && !slotError && !slots.length && !space.isDemo && <p role="status" className="mt-3 rounded-xl bg-surface-soft p-3 text-sm text-muted">No available times on this date. The host may be closed, booked, or the hours have passed. Try another date.</p>}
      {canReserve && <p className="mt-2 text-center text-xs text-muted">{label(effectiveStart)} – {label(endHour)} · {space.minHours} hr minimum</p>}

      {error && <p className="mt-3 text-sm font-medium text-brand" role="alert">{error}</p>}

      <button
        type="button"
        onClick={() => void reserve()}
        disabled={submitting || space.isDemo || !canReserve}
        className="mt-4 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
      >
        {space.isDemo ? "Preview only" : submitting ? "Checking availability…" : "Reserve"}
      </button>

      {canReserve && <div className="mt-5 space-y-3 text-sm">
        <p className="text-center text-muted">You won&apos;t be charged yet</p>
        <Row
          label={`$${space.hourlyPrice} × ${effectiveHours} hours`}
          value={`$${subtotal.toFixed(2)}`}
        />
        <Row label="Yardly service fee" value={`$${serviceFee.toFixed(2)}`} />
        <div className="border-t border-border-soft pt-3">
          <Row label="Total" value={`$${total.toFixed(2)}`} bold />
        </div>
      </div>}
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
