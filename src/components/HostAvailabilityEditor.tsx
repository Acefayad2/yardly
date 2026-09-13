"use client";

import { useEffect, useState } from "react";
import { DEFAULT_HOURS, WEEKDAYS, hourLabel, scheduleError, type WeeklyHours } from "@/lib/availability";
import { listingToday } from "@/lib/booking";
import { getSupabase } from "@/lib/supabase";
import type { HostListing } from "@/lib/types";

export default function HostAvailabilityEditor({ listing, userId }: { listing: HostListing; userId: string }) {
  const [hours, setHours] = useState<WeeklyHours>(DEFAULT_HOURS);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data, error } = await getSupabase().from("listings").select("weekly_hours,blocked_dates")
          .eq("id", listing.id).eq("host_id", userId).single();
        if (error) throw error;
        if (!cancelled) { setHours(data.weekly_hours); setBlockedDates(data.blocked_dates); setLoaded(true); setLoading(false); }
      } catch {
        if (!cancelled) { setError("We couldn’t load availability. Please try again."); setLoading(false); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [listing.id, userId, retry]);

  function changeDay(index: number, day: [number, number] | null) {
    setHours((current) => current.map((value, i) => i === index ? day : value));
    setSaved(false); setError("");
  }

  async function save() {
    const invalid = scheduleError(hours, listing.minHours);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setSaved(false); setError("");
    try {
      const { error } = await getSupabase().from("listings").update({ weekly_hours: hours, blocked_dates: blockedDates })
        .eq("id", listing.id).eq("host_id", userId).select("id").single();
      if (error) throw error;
      setSaved(true);
    } catch (cause) {
      setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "Availability couldn’t be saved. Try again.");
    } finally { setSaving(false); }
  }

  return <>
    <p className="mt-7 text-sm font-semibold text-brand-dark">{listing.title}</p>
    <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your availability</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Set the hours guests can book in {listing.timezone.replaceAll("_", " ")}. Bookings stay on one date, with a {listing.minHours}-hour minimum.</p>
    {loading ? <p className="mt-8" role="status">Loading availability…</p> : <>
      <fieldset disabled={saving || !loaded} className="mt-7 rounded-2xl border border-border-soft bg-white p-5 sm:p-7">
        <legend className="sr-only">Weekly opening hours</legend>
        <h2 className="text-lg font-semibold">Weekly opening hours</h2>
        <p className="mt-1 text-sm text-muted">Choose an opening window between 8 AM and 10 PM, or close a day.</p>
        <div className="mt-5 divide-y divide-border-soft">
          {WEEKDAYS.map((name, index) => {
            const day = hours[index];
            return <div key={name} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={day !== null} onChange={(event) => changeDay(index, event.target.checked ? [8, 22] : null)} className="h-5 w-5 accent-brand" />{name}
              </label>
              {day ? <div className="flex w-full items-center gap-2 sm:w-auto">
                <select aria-label={`${name} opens`} value={day[0]} onChange={(event) => changeDay(index, [Number(event.target.value), day[1]])} className="host-input min-w-0 flex-1 sm:w-32">
                  {Array.from({ length: 14 }, (_, i) => i + 8).map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </select>
                <span className="text-sm text-muted">to</span>
                <select aria-label={`${name} closes`} value={day[1]} onChange={(event) => changeDay(index, [day[0], Number(event.target.value)])} className="host-input min-w-0 flex-1 sm:w-32">
                  {Array.from({ length: 14 }, (_, i) => i + 9).map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </select>
              </div> : <span className="text-sm text-muted">Closed</span>}
            </div>;
          })}
        </div>
        <h2 className="mt-7 text-lg font-semibold">Blocked dates</h2>
        <p className="mt-1 text-sm text-muted">Keep a whole date for yourself, even when you’re normally open.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">Date to block
            <input type="date" min={listingToday(listing.timezone)} value={date} onChange={(event) => setDate(event.target.value)} className="host-input mt-2" />
          </label>
          <button type="button" onClick={() => {
            if (!date || date < listingToday(listing.timezone)) { setError("Choose a current or future date to block."); return; }
            if (blockedDates.length >= 730) { setError("You can block up to 730 dates."); return; }
            setBlockedDates((current) => [...new Set([...current, date])].sort()); setDate(""); setSaved(false); setError("");
          }} className="min-h-12 rounded-xl border border-border px-4 text-sm font-semibold">Block date</button>
        </div>
        <ul className="mt-4 space-y-2">
          {blockedDates.map((blocked) => <li key={blocked} className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-2 text-sm">
            <time dateTime={blocked}>{blocked}</time><button type="button" aria-label={`Unblock ${blocked}`} onClick={() => { setBlockedDates((current) => current.filter((item) => item !== blocked)); setSaved(false); }} className="min-h-11 px-2 font-semibold underline">Remove</button>
          </li>)}
        </ul>
        {!blockedDates.length && <p className="mt-4 text-sm text-muted">No dates blocked.</p>}
        <p className="mt-6 rounded-xl bg-surface-soft p-4 text-sm leading-6 text-muted">Changes apply to new bookings only. Existing reservations are not cancelled or moved. Keep those commitments or handle them from Reservations.</p>
        <button type="button" onClick={() => void save()} disabled={saving || error.startsWith("We couldn’t load")} className="mt-6 min-h-12 w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save availability"}</button>
      </fieldset>
    </>}
    {error && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}
      {error.startsWith("We couldn’t load") && <button type="button" className="ml-3 font-semibold underline" onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Retry</button>}
    </div>}
    {saved && <p role="status" className="mt-4 rounded-xl bg-brand/10 p-4 text-sm text-brand-dark">Availability saved. Guests will see your updated hours and blocked dates.</p>}
  </>;
}
