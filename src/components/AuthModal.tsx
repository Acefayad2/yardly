"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export default function AuthModal() {
  const { authOpen, setAuthOpen, login } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "message"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const result = await login(mode, name.trim(), email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setFeedback({ type: "error", text: result.error });
      return;
    }
    if (result.message) {
      setFeedback({ type: "message", text: result.message });
      setPassword("");
      return;
    }
    reset();
  }

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => { setAuthOpen(false); setFeedback(null); }}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl animate-fade-in">
        <div className="flex items-center justify-center border-b border-border-soft px-4 py-4">
          <button
            onClick={() => { setAuthOpen(false); setFeedback(null); }}
            className="absolute left-4 grid h-7 w-7 place-items-center rounded-full hover:bg-border-soft"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <h2 className="text-base font-semibold">
            {mode === "login" ? "Log in" : "Sign up"}
          </h2>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <h3 className="text-2xl font-semibold">Welcome to Yardly</h3>

          <div className="overflow-hidden rounded-xl border border-border">
            {mode === "signup" && (
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full border-b border-border px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/70"
              />
            )}
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full border-b border-border px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/70"
            />
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-foreground/70"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-brand to-brand-dark py-3.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Continue" : "Create account"}
          </button>

          {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${feedback.type === "error" ? "bg-red-50 text-red-700" : "bg-brand/10 text-brand-dark"}`}>{feedback.text}</p>}

          <p className="text-center text-sm text-muted">
            {mode === "login" ? "New to Yardly? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setFeedback(null); }}
              className="font-semibold text-foreground underline"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
          <p className="text-center text-xs text-muted">Your account and host data are securely stored with Supabase.</p>
        </form>
      </div>
    </div>
  );
}
