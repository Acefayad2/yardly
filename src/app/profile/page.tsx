"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export default function ProfilePage() {
  const { user, bookings, favorites, logout, setAuthOpen } = useStore();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-dark">Your Yardly</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Profile</h1>
      {user ? (
        <div className="mt-10">
          <div className="flex items-center gap-4 rounded-2xl bg-surface-soft p-6">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-xl font-semibold text-white" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{user.name}</h2>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/bookings" className="rounded-2xl border border-border-soft p-5 transition hover:bg-surface-soft">
              <strong className="block text-2xl tabular-nums">{bookings.length}</strong>
              <span className="text-sm text-muted">Bookings</span>
            </Link>
            <Link href="/wishlists" className="rounded-2xl border border-border-soft p-5 transition hover:bg-surface-soft">
              <strong className="block text-2xl tabular-nums">{favorites.length}</strong>
              <span className="text-sm text-muted">Saved spaces</span>
            </Link>
          </div>
          <button type="button" onClick={logout} className="mt-8 text-sm font-semibold underline underline-offset-4">Log out</button>
        </div>
      ) : (
        <div className="mt-10 rounded-2xl bg-surface-soft px-6 py-12 text-center sm:px-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-xl font-semibold text-brand-dark" aria-hidden="true">Y</span>
          <h2 className="mt-5 text-xl font-semibold">Sign in to your Yardly</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">Manage bookings, saved spaces, and conversations with hosts.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Sign in</button>
        </div>
      )}
    </div>
  );
}
