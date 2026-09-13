"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function ProfileEditor() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void getSupabase().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      else {
        setName(String(data.user?.user_metadata.full_name || ""));
        setPhone(String(data.user?.user_metadata.phone_number || ""));
        setBirthday(String(data.user?.user_metadata.date_of_birth || ""));
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const normalizedPhone = phone.replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) { setError("Enter a valid phone number, including the country code."); return; }
    setSaving(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ data: { full_name: name.trim(), phone_number: normalizedPhone, date_of_birth: birthday } });
      if (error) throw error;
      setMessage("Your profile details have been saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "We couldn’t save your profile."); }
    finally { setSaving(false); }
  }
  return <section className="mt-6 rounded-2xl border border-border-soft p-6">
    <h2 className="text-lg font-semibold">Personal details</h2>
    {loading ? <p role="status" className="mt-4 text-sm text-muted">Loading your details…</p> : <form onSubmit={save} className="mt-4 space-y-4">
      <label className="block text-sm font-medium">Full name<input className="host-input mt-2" required maxLength={100} value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-sm font-medium">Phone number<input className="host-input mt-2" required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="block text-sm font-medium">Date of birth<input className="host-input mt-2" required type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={birthday} onChange={(event) => setBirthday(event.target.value)} /></label>
      <p className="text-xs text-muted">Your phone number and date of birth are not shown on public listings.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-brand-dark">{message}</p>}
      <button disabled={saving} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save details"}</button>
    </form>}
  </section>;
}
