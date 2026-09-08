"use client";

import HostNav from "./HostNav";
import { useStore } from "@/lib/store";

export default function HostSignInRequired() {
  const { authLoading, setAuthOpen } = useStore();

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <HostNav />
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        {authLoading ? (
          <p role="status" className="text-muted">Checking your account…</p>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">Sign in to host</h1>
            <p className="mt-3 text-muted">Your host dashboard, listings, and reservations are connected to your Yardly account.</p>
            <button type="button" onClick={() => setAuthOpen(true)} className="mt-7 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white">Sign in</button>
          </>
        )}
      </div>
    </div>
  );
}
