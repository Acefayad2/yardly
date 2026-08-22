"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export default function MessagesPage() {
  const { user, setAuthOpen } = useStore();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-dark">Inbox</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Messages</h1>
      <div className="mt-10 rounded-2xl bg-surface-soft px-6 py-12 text-center sm:px-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-2xl" aria-hidden="true">↗</span>
        <h2 className="mt-5 text-xl font-semibold">{user ? "Your conversations will appear here" : "Sign in to message hosts"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          {user
            ? "Ask about setup, parking, vendors, or anything else before your gathering."
            : "Keep questions and booking details together in one place."}
        </p>
        {user ? (
          <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Explore spaces</Link>
        ) : (
          <button type="button" onClick={() => setAuthOpen(true)} className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Sign in</button>
        )}
      </div>
    </div>
  );
}
