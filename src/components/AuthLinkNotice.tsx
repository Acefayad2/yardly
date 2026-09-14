"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export default function AuthLinkNotice() {
  const [failed, setFailed] = useState(false);
  const { setAuthOpen } = useStore();
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (query.has("error") || hash.has("error")) queueMicrotask(() => setFailed(true));
  }, []);
  if (!failed) return null;
  return <div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
    <p className="font-semibold">This account link is expired or no longer valid.</p>
    <p className="mt-1">Request a fresh link and open it in the same browser where you requested it.</p>
    <div className="mt-3 flex flex-wrap gap-4"><Link className="font-semibold underline" href="/reset-password/">Request password reset</Link><button className="font-semibold underline" onClick={() => setAuthOpen(true)}>Sign in or resend confirmation</button><button className="underline" onClick={() => setFailed(false)}>Dismiss</button></div>
  </div>;
}
