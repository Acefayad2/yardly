"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { Listing } from "@/lib/types";
import { useStore } from "@/lib/store";

export default function BookingWidget({ listing }: { listing: Listing }) {
  const { user, setAuthOpen, addBooking } = useStore();
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [error, setError] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  }, [checkIn, checkOut]);

  const cleaningFee = 85;
  const subtotal = nights * listing.price;
  const serviceFee = Math.round(subtotal * 0.12);
  const total = subtotal + (nights ? cleaningFee + serviceFee : 0);

  function reserve() {
    setError("");
    if (!checkIn || !checkOut) return setError("Add your travel dates.");
    if (nights <= 0) return setError("Check-out must be after check-in.");
    if (!user) {
      setAuthOpen(true);
      return;
    }
    addBooking({
      id: crypto.randomUUID(),
      listingId: listing.id,
      title: listing.title,
      image: listing.images[0],
      location: listing.location,
      checkIn,
      checkOut,
      guests,
      nights,
      total,
      createdAt: new Date().toISOString(),
    });
    router.push("/trips?booked=1");
  }

  return (
    <div className="rounded-2xl border border-border p-6 shadow-xl">
      <div className="flex items-baseline justify-between">
        <p>
          <span className="text-2xl font-semibold">${listing.price}</span>
          <span className="text-muted"> night</span>
        </p>
        <span className="flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" /></svg>
          {listing.rating.toFixed(2)} · <span className="text-muted underline">{listing.reviews} reviews</span>
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-2">
          <label className="border-b border-r border-border px-3 py-2.5">
            <span className="block text-[10px] font-bold uppercase tracking-wide">Check-in</span>
            <input
              type="date"
              min={today}
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="border-b border-border px-3 py-2.5">
            <span className="block text-[10px] font-bold uppercase tracking-wide">Checkout</span>
            <input
              type="date"
              min={checkIn || today}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <label className="block px-3 py-2.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide">Guests</span>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full bg-transparent text-sm outline-none"
          >
            {Array.from({ length: listing.guests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-rausch">{error}</p>}

      <button
        onClick={reserve}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-rausch to-rausch-dark py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
      >
        {nights > 0 ? "Reserve" : "Check availability"}
      </button>

      {nights > 0 && (
        <div className="mt-5 space-y-3 text-sm">
          <p className="text-center text-muted">You won&apos;t be charged yet</p>
          <Row label={`$${listing.price} × ${nights} nights`} value={`$${subtotal}`} />
          <Row label="Cleaning fee" value={`$${cleaningFee}`} />
          <Row label="Service fee" value={`$${serviceFee}`} />
          <div className="border-t border-border-soft pt-3">
            <Row label="Total" value={`$${total}`} bold />
          </div>
        </div>
      )}
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
