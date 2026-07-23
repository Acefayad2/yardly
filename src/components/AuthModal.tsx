"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export default function AuthModal() {
  const { authOpen, setAuthOpen, login } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!authOpen) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = mode === "signup" ? name.trim() : email.split("@")[0];
    login(displayName || "Guest", email.trim() || "guest@stayscape.co");
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
        onClick={() => setAuthOpen(false)}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl animate-fade-in">
        <div className="flex items-center justify-center border-b border-border-soft px-4 py-4">
          <button
            onClick={() => setAuthOpen(false)}
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
          <h3 className="text-2xl font-semibold">Welcome to stayscape</h3>

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
            className="w-full rounded-xl bg-gradient-to-r from-rausch to-rausch-dark py-3.5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            {mode === "login" ? "Continue" : "Create account"}
          </button>

          <p className="text-center text-sm text-muted">
            {mode === "login" ? "New to stayscape? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-semibold text-foreground underline"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
          <p className="text-center text-xs text-muted">
            Demo auth — no real account is created. Data stays in your browser.
          </p>
        </form>
      </div>
    </div>
  );
}
