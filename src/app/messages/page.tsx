"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { spaceHref } from "@/lib/spaces";

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading messages…</div>}>
      <MessagesContent />
    </Suspense>
  );
}

function MessagesContent() {
  const params = useSearchParams();
  const { user, bookings, conversations, conversationsLoading, conversationsError, sendMessage, setAuthOpen } = useStore();
  const requestedId = params.get("conversation") ?? "";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<{ conversationId: string; message: string } | null>(null);
  const sendInFlight = useRef(false);

  const effectiveSelectedId = requestedId || conversations[0]?.id;
  // Never fall back to a different recipient for a stale or unauthorized deep link.
  const selected = conversations.find((conversation) => conversation.id === effectiveSelectedId);
  const draftKey = `${user?.id}:${selected?.id}`;
  const draft = selected ? drafts[draftKey] ?? "" : "";
  const sending = sendingId !== null;
  const listingTitle = (conversation: (typeof conversations)[number]) => conversation.listingAvailable
    ? conversation.listingTitle
    : bookings.find((booking) => booking.spaceId === conversation.listingId)?.title ?? conversation.listingTitle;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || sendInFlight.current) return;
    const conversationId = selected.id;
    sendInFlight.current = true;
    setSendingId(conversationId);
    setSendError(null);
    const result = await sendMessage(conversationId, draft);
    sendInFlight.current = false;
    setSendingId(null);
    if (result.error) {
      setSendError({ conversationId, message: result.error });
      return;
    }
    setDrafts((previous) => ({ ...previous, [draftKey]: "" }));
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-dark">Inbox</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Messages</h1>
        <div className="mt-10 rounded-2xl bg-surface-soft px-6 py-12">
          <h2 className="text-xl font-semibold">Sign in to message hosts</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Keep questions and reservation details private and connected to the right space.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-dark">Inbox</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Messages</h1>

      {conversationsError && <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{conversationsError}</p>}
      {conversationsLoading ? (
        <div className="mt-8 rounded-2xl bg-surface-soft px-6 py-16 text-center" role="status">Loading conversations…</div>
      ) : conversations.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-surface-soft px-6 py-16 text-center">
          <h2 className="text-xl font-semibold">No conversations yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Open a space and choose “Message host” to ask a question.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Explore spaces</Link>
        </div>
      ) : (
        <div className="mt-8 grid min-h-[34rem] overflow-hidden rounded-2xl border border-border-soft bg-white md:grid-cols-[19rem_1fr]">
          <aside className="border-b border-border-soft md:border-b-0 md:border-r" aria-label="Conversations">
            {conversations.map((conversation) => {
              const lastMessage = conversation.messages.at(-1);
              return (
                <Link key={conversation.id} href={`/messages/?conversation=${encodeURIComponent(conversation.id)}`} aria-current={selected?.id === conversation.id ? "page" : undefined} className={`flex w-full gap-3 border-b border-border-soft p-4 text-left transition ${selected?.id === conversation.id ? "bg-brand/5" : "hover:bg-surface-soft"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={conversation.listingImage} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{listingTitle(conversation)}</strong>
                    <span className="mt-1 block truncate text-xs text-muted">{lastMessage?.body ?? "Start the conversation"}</span>
                  </span>
                </Link>
              );
            })}
          </aside>

          {!selected && <p className="p-6 text-sm text-muted">This conversation is not available for this account. Choose a conversation from your inbox.</p>}
          {selected && (
            <section className="flex min-h-[30rem] flex-col" aria-label={`Conversation about ${listingTitle(selected)}`}>
              <header className="flex items-center justify-between border-b border-border-soft px-5 py-4">
                <div>
                  <h2 className="font-semibold">{listingTitle(selected)}</h2>
                  <p className="text-xs text-muted">Private conversation</p>
                </div>
                {selected.listingAvailable && <Link href={spaceHref(selected.listingId)} className="text-sm font-semibold text-brand-dark">View space</Link>}
              </header>

              {!selected.listingAvailable && <p className="border-b border-border-soft px-5 py-3 text-xs text-muted">The listing is not currently available. Your conversation is still open.</p>}

              <div className="flex-1 space-y-3 overflow-y-auto bg-surface-soft/50 p-5" aria-live="polite">
                {selected.messages.length === 0 && <p className="mx-auto max-w-sm py-16 text-center text-sm text-muted">Ask about parking, setup, rules, or anything else you need before reserving.</p>}
                {selected.messages.map((message) => {
                  const mine = message.senderId === user.id;
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${mine ? "bg-brand text-white" : "border border-border-soft bg-white"}`}>
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{formatMessageTime(message.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={submit} className="border-t border-border-soft p-4">
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="message-body">Message</label>
                  <textarea id="message-body" required maxLength={2000} rows={2} value={draft} disabled={sendingId === selected.id} onChange={(event) => setDrafts((previous) => ({ ...previous, [draftKey]: event.target.value }))} placeholder="Write a message…" className="host-input min-h-12 flex-1 resize-none" />
                  <button type="submit" disabled={sending || !draft.trim()} className="self-end rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
                </div>
                {sendError?.conversationId === selected.id && <p role="alert" className="mt-2 text-sm text-red-700">{sendError.message}</p>}
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
