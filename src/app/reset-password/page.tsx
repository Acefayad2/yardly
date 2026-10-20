"use client";

import Link from "next/link";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const { user, authLoading } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (user && password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (user) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword(""); setConfirmation("");
        setMessage("Your password has been updated.");
      } else {
        const redirectTo = Capacitor.isNativePlatform() ? "com.acefayad.yardly://auth/callback" : `${window.location.origin}/reset-password/`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setMessage("If that email has a Yardly account, a reset link is on its way. Open it on this device and browser to choose a new password.");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "We couldn’t update your password. Please try again."); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-lg px-6 py-12">
    <Link href="/profile/" className="text-sm font-semibold text-brand">← Back to profile</Link>
    <h1 className="mt-6 text-3xl font-semibold tracking-tight">{user ? "Choose a new password" : "Reset your password"}</h1>
    <p className="mt-3 text-sm leading-6 text-muted">{user ? "Use a unique password with at least 8 characters." : "Enter your account email and we’ll send you a reset link. If your previous link expired, request a new one here."}</p>
    {authLoading ? <p role="status" className="mt-6">Checking your session…</p> : <form onSubmit={submit} className="mt-8 space-y-5">
      {user ? <>
        <label className="block text-sm font-semibold">New password<input className="host-input mt-2" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Confirm new password<input className="host-input mt-2" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      </> : <label className="block text-sm font-semibold">Email address<input className="host-input mt-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-brand-dark">{message}</p>}
      <button disabled={busy} type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : user ? "Update password" : "Send reset link"}</button>
    </form>}
  </section>;
}
