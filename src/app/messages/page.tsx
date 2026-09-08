"use client";

import { Suspense, useState, type FormEvent } from "react";
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
  const { user, conversations, conversationsLoading, conversationsError, sendMessage, setAuthOpen } = useStore();
  const requestedId = params.get("conversation") ?? "";
  const [selectedId, setSelectedId] = useState(requestedId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const effectiveSelectedId = selectedId || requestedId || conversations[0]?.id;
  const selected = conversations.find((conversation) => conversation.id === effectiveSelectedId) ?? conversations[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSending(true);
    setSendError("");
    const result = await sendMessage(selected.id, draft);
    setSending(false);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    setDraft("");
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-center animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-dark">Inbox</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Messages</h1>
        <div className="mt-10 rounded-2xl bg-surface-soft px-6 py-12">
          <h2 className="text-xl font-semibold">Sign in to message hosts</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Keep questions and reservation details private and connected to the right space.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 animate-fade-in">
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
                <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} aria-pressed={selected?.id === conversation.id} className={`flex w-full gap-3 border-b border-border-soft p-4 text-left transition ${selected?.id === conversation.id ? "bg-brand/5" : "hover:bg-surface-soft"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={conversation.listingImage} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{conversation.listingTitle}</strong>
                    <span className="mt-1 block truncate text-xs text-muted">{lastMessage?.body ?? "Start the conversation"}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          {selected && (
            <section className="flex min-h-[30rem] flex-col" aria-label={`Conversation about ${selected.listingTitle}`}>
              <header className="flex items-center justify-between border-b border-border-soft px-5 py-4">
                <div>
                  <h2 className="font-semibold">{selected.listingTitle}</h2>
                  <p className="text-xs text-muted">Private conversation</p>
                </div>
                <Link href={spaceHref(selected.listingId)} className="text-sm font-semibold text-brand-dark">View space</Link>
              </header>

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
                  <textarea id="message-body" required maxLength={2000} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" className="host-input min-h-12 flex-1 resize-none" />
                  <button type="submit" disabled={sending || !draft.trim()} className="self-end rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
                </div>
                {sendError && <p role="alert" className="mt-2 text-sm text-red-700">{sendError}</p>}
              </form>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
