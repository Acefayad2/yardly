"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useStore } from "@/lib/store";

// Uses only participant-visible conversations. Hosts cannot create a guest's
// thread under the current database policy, and private profiles stay private.
export default function BookingContact({ listingId, guestId }: { listingId: string; guestId?: string }) {
  const { user, spaces, conversations, conversationsLoading, conversationsError, startConversation } = useStore();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const hosting = guestId !== undefined;
  const thread = conversations.find((conversation) => conversation.listingId === listingId
    && (hosting
      ? conversation.hostId === user?.id && conversation.guestId === guestId
      : conversation.guestId === user?.id));
  const label = hosting ? "Message guest" : "Message host";

  if (conversationsLoading) return <p className="text-xs text-muted" role="status">Loading contact options…</p>;
  if (thread) return <Link href={`/messages/?conversation=${encodeURIComponent(thread.id)}`} className="inline-block text-sm font-semibold text-brand underline">{label}</Link>;
  if (conversationsError) return <p className="text-xs text-muted">Contact options could not be loaded. <Link href="/messages/" className="underline">Open Messages</Link> to check your inbox.</p>;
  const canStart = !hosting && spaces.some((space) => space.id === listingId && !space.isDemo && space.hostId !== user?.id);
  if (!canStart) return <p className="max-w-sm text-xs text-muted">{hosting
    ? "No conversation yet. Your guest can message you from their booking while the listing is published."
    : "No conversation yet. A new conversation can be started when the listing is published again."}</p>;

  async function openConversation() {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setError("");
    try {
      const result = await startConversation(listingId);
      if (result.error || !result.id) {
        setError(result.error || "The conversation could not be opened. Please try again.");
        return;
      }
      router.push(`/messages/?conversation=${encodeURIComponent(result.id)}`);
    } finally {
      inFlight.current = false;
      setOpening(false);
    }
  }

  return <div>
    <button type="button" disabled={opening} onClick={() => void openConversation()} className="text-sm font-semibold text-brand underline disabled:opacity-50">{opening ? "Opening conversation…" : label}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
