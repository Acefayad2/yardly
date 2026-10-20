"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

const categories = ["Food & drink", "Parks & outdoors", "Attractions", "Essentials"] as const;
type Recommendation = { slot: number; name: string; category: string; address: string; note: string };
const blank = (slot: number): Recommendation => ({ slot, name: "", category: categories[0], address: "", note: "" });
const buttonClass = "min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function NearbyActivities({ listingId, editable = false }: { listingId: string; editable?: boolean }) {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Recommendation | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await getSupabase().from("listing_recommendations")
          .select("slot,name,category,address,note").eq("listing_id", listingId).order("slot");
        if (error) throw error;
        if (active) setItems(data ?? []);
      } catch {
        if (active) setError("Nearby recommendations could not be loaded. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [listingId, attempt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    if (!draft.name.trim() || draft.address.trim().length < 3) {
      setError("Enter a place name and its public address.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const row = { ...draft, name: draft.name.trim(), address: draft.address.trim(), note: draft.note.trim() };
      const { data, error } = await getSupabase().from("listing_recommendations")
        .upsert({ ...row, listing_id: listingId }, { onConflict: "listing_id,slot" })
        .select("slot,name,category,address,note").single();
      if (error || !data) throw error;
      setItems(current => [...current.filter(item => item.slot !== data.slot), data].sort((a, b) => a.slot - b.slot));
      setDraft(null);
      setNotice("Recommendation saved.");
    } catch {
      setError("Your recommendation could not be saved. Your changes are still here; please try again.");
    } finally { setSaving(false); }
  }

  async function remove(slot: number) {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await getSupabase().from("listing_recommendations").delete()
        .eq("listing_id", listingId).eq("slot", slot).select("slot");
      if (error || data?.length !== 1) throw error;
      setItems(current => current.filter(item => item.slot !== slot));
      setNotice("Recommendation removed.");
    } catch { setError("The recommendation could not be removed. Please try again."); }
    finally { setSaving(false); }
  }

  return <section className="mt-5 rounded-2xl border border-border bg-white p-4 sm:p-6" aria-label="Things to do nearby">
    <h2 className="text-lg font-semibold">Things to do nearby</h2>
    <p className="mt-1 text-sm text-muted">{editable
      ? "Share up to six local favorites with booked guests. Use public business or attraction addresses—not your property's private address."
      : "Local favorites recommended by your host. Check hours and availability with each venue before visiting."}</p>
    {loading ? <p role="status" className="mt-4 text-sm text-muted">Loading local favorites…</p> : <>
      {!error && !items.length && <p className="mt-4 text-sm text-muted">{editable ? "No recommendations yet. Add your first local favorite below." : "Your host hasn't added local recommendations yet. You can ask them for suggestions in Messages."}</p>}
      <div className="mt-4 grid gap-3">
        {items.map(item => <article key={item.slot} className="min-w-0 rounded-xl bg-surface-soft p-4">
          <p className="text-xs font-semibold text-brand-dark">{item.category}</p>
          <h3 className="mt-1 break-words font-semibold">{item.name}</h3>
          <p className="mt-1 break-words text-sm text-muted">{item.address}</p>
          {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.note}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.name}, ${item.address}`)}`} target="_blank" rel="noopener noreferrer" className={buttonClass}>Directions<span className="sr-only"> to {item.name} (opens Google Maps)</span></a>
            {editable && <><button type="button" disabled={saving || !!draft} onClick={() => { setDraft({ ...item }); setNotice(""); }} className={buttonClass}>Edit<span className="sr-only"> {item.name}</span></button><button type="button" disabled={saving || !!draft} onClick={() => void remove(item.slot)} className={buttonClass}>Remove<span className="sr-only"> {item.name}</span></button></>}
          </div>
        </article>)}
      </div>
      {editable && !draft && items.length < 6 && !error && <button type="button" disabled={saving} className={`${buttonClass} mt-4`} onClick={() => { setDraft(blank([1, 2, 3, 4, 5, 6].find(slot => !items.some(item => item.slot === slot))!)); setNotice(""); }}>Add recommendation</button>}
    </>}
    {error && <div role="alert" className="mt-4 text-sm text-red-700">{error}{!draft && <button type="button" disabled={saving} className="ml-2 min-h-11 underline" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }}>Retry</button>}</div>}
    {notice && <p role="status" className="mt-3 text-sm text-brand-dark">{notice}</p>}
    {editable && draft && <form onSubmit={save} className="mt-4 space-y-4 rounded-xl border border-border p-4">
      <h3 className="font-semibold">Local recommendation</h3>
      <label className="block text-sm font-medium">Place name<input required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3" /></label>
      <label className="block text-sm font-medium">Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3">{categories.map(category => <option key={category}>{category}</option>)}</select></label>
      <label className="block text-sm font-medium">Public place address<input required minLength={3} maxLength={240} value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3" /></label>
      <label className="block text-sm font-medium">Host tip (optional)<textarea maxLength={400} rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className="mt-1 block w-full rounded-lg border border-border p-3" /></label>
      <div className="flex flex-wrap gap-3"><button disabled={saving} className={`${buttonClass} bg-brand text-white`}>{saving ? "Saving…" : "Save recommendation"}</button><button type="button" disabled={saving} onClick={() => { setDraft(null); setError(""); }} className={buttonClass}>Cancel</button></div>
    </form>}
  </section>;
}
