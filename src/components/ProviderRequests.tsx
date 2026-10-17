"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { PROVIDER_PROFILE_SELECT, mapProviderProfile, type ProviderProfile } from "@/lib/provider-marketplace";
import { PROVIDER_REQUEST_SELECT, REQUEST_STATUS_LABELS, mapProviderRequest, validateRequestedItems, type ProviderRequest } from "@/lib/provider-requests";
import styles from "./ProviderRequests.module.css";

type Notice = { kind: "error" | "success"; text: string } | null;

export default function ProviderRequests() { return <Suspense fallback={<RequestStatus title="Loading requests…" body="Opening your provider workspace." />}><ProviderRequestsContent /></Suspense>; }

function ProviderRequestsContent() {
  const params = useSearchParams();
  const { user, authLoading, setAuthOpen } = useStore();
  const providerId = params.get("provider") ?? "";
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (providerId) {
        const result = await supabase.from("provider_profiles").select(PROVIDER_PROFILE_SELECT).eq("id", providerId).eq("review_state", "approved").maybeSingle();
        if (result.error) throw result.error;
        setProvider(result.data ? mapProviderProfile(result.data as Record<string, unknown>) : null);
      } else setProvider(null);
      if (user) {
        const result = await supabase.from("provider_requests").select(PROVIDER_REQUEST_SELECT).order("updated_at", { ascending: false });
        if (result.error) throw result.error;
        setRequests((result.data ?? []).map((row) => mapProviderRequest(row as Record<string, unknown>)));
      } else setRequests([]);
    } catch (error) { setNotice({ kind: "error", text: errorMessage(error, "load provider requests") }); }
    finally { setLoading(false); }
  }, [providerId, user]);

  useEffect(() => { if (!authLoading) queueMicrotask(() => void load()); }, [authLoading, load]);
  if (authLoading || loading) return <RequestStatus title="Loading requests…" body="Checking the latest quote and confirmation details." />;
  if (!user) return <main className={styles.page}><RequestStatus title="Sign in to request or manage quotes" body="Provider requests and messages are private to the customer and provider."><button className={styles.primary} onClick={() => setAuthOpen(true)}>Sign in</button></RequestStatus></main>;
  return <main className={styles.page}>
    <header className={styles.header}><div><p>Separate provider quotes</p><h1>Requests and confirmations</h1><span>Yardly keeps details together. Providers collect their own payments; a request never reserves services or inventory.</span></div><Link href="/services">Browse providers</Link></header>
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? styles.error : styles.success}>{notice.text}</div>}
    {providerId && (provider ? <NewRequestForm provider={provider} onCreated={load} onNotice={setNotice} /> : <RequestStatus title="Provider not available" body="Only reviewed providers can receive new requests." />)}
    <section className={styles.list} aria-labelledby="requests-heading"><div className={styles.heading}><div><p>Your workspace</p><h2 id="requests-heading">Current requests</h2></div></div>
      {!requests.length ? <RequestStatus title="No provider requests yet" body="Choose a reviewed provider to start a private request." /> : requests.map((request) => <RequestCard key={request.id} request={request} userId={user.id} onChanged={load} onNotice={setNotice} />)}
    </section>
  </main>;
}

function NewRequestForm({ provider, onCreated, onNotice }: { provider: ProviderProfile; onCreated: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const items = provider.kind === "equipment" ? provider.inventory.map((item) => ({ inventory_item_id: item.id ?? "", quantity: Number(form.get(`quantity-${item.id}`) ?? 0), options: String(form.get(`options-${item.id}`) ?? "").trim() })).filter((item) => item.quantity > 0) : [];
    if (provider.kind === "equipment" && !validateRequestedItems(items)) { onNotice({ kind: "error", text: "Choose at least one listed item and enter a whole-number quantity." }); return; }
    setSaving(true); onNotice(null);
    try {
      const result = await getSupabase().rpc("create_provider_request", { p_provider_id: provider.id, p_event_date: String(form.get("date")), p_start_time: String(form.get("start")), p_end_time: String(form.get("end")), p_event_location: String(form.get("location")), p_guest_count: Number(form.get("guests")), p_needs: String(form.get("needs")), p_items: items });
      if (result.error) throw result.error;
      onNotice({ kind: "success", text: `Request sent to ${provider.businessName}. Nothing is reserved until the provider confirms.` });
      formElement.reset(); await onCreated();
    } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "send provider request") }); }
    finally { setSaving(false); }
  }
  return <section className={styles.panel}><div className={styles.heading}><div><p>New request</p><h2>{provider.businessName}</h2></div><span>{provider.kind === "equipment" ? "Equipment rental" : provider.category}</span></div><form className={styles.form} onSubmit={(event) => void submit(event)}>
    <label>Event date<input required type="date" name="date" /></label><label>Location<input required minLength={3} name="location" /></label><label>Start time<input required type="time" name="start" /></label><label>End time<input required type="time" name="end" /></label><label>Guest count<input required type="number" min="1" name="guests" /></label>
    <label className={styles.wide}>What do you need?<textarea required minLength={10} rows={4} name="needs" /></label>
    {provider.kind === "equipment" && <fieldset className={styles.wide}><legend>Equipment quantities</legend>{provider.inventory.map((item) => <div key={item.id}><label>{item.name} quantity (up to {item.quantityAvailable})<input aria-label={`${item.name} quantity`} name={`quantity-${item.id}`} type="number" min="0" max={item.quantityAvailable} step="1" defaultValue="0" /></label><label>{item.name} options<input aria-label={`${item.name} options`} name={`options-${item.id}`} placeholder="Color, delivery, or setup notes" /></label></div>)}</fieldset>}
    <button disabled={saving} className={styles.primary} type="submit">{saving ? "Sending…" : "Send request"}</button>
  </form></section>;
}

function RequestCard({ request, userId, onChanged, onNotice }: { request: ProviderRequest; userId: string; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const providerView = request.providerOwnerId === userId;
  const [busy, setBusy] = useState(false);
  async function action(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true); onNotice(null);
    try { const result = await getSupabase().rpc(name, args); if (result.error) throw result.error; onNotice({ kind: "success", text: success }); await onChanged(); }
    catch (error) { onNotice({ kind: "error", text: errorMessage(error, "update provider request") }); }
    finally { setBusy(false); }
  }
  async function quote(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await action("quote_provider_request", { p_request_id: request.id, p_full_price: Number(form.get("price")), p_deposit_amount: Number(form.get("deposit")), p_cancellation_terms: String(form.get("cancellation")), p_inclusions: String(form.get("inclusions")) }, "Quote sent to the customer."); }
  async function message(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); await action("send_provider_request_message", { p_request_id: request.id, p_body: String(form.get("message")) }, "Message sent."); formElement.reset(); }
  return <article className={styles.request}>
    <div className={styles.requestTop}><div><span className={styles.status}>{REQUEST_STATUS_LABELS[request.status]}</span><h3>{request.providerName}</h3><p>{request.eventDate} · {request.startTime}–{request.endTime} · {request.guestCount} guests</p></div><strong>{providerView ? "Provider view" : "Customer view"}</strong></div>
    <dl className={styles.summary}><div><dt>Location</dt><dd>{request.location}</dd></div><div><dt>Needs</dt><dd>{request.needs}</dd></div>{request.items.length > 0 && <div><dt>Equipment</dt><dd>{request.items.map((item) => `${item.name} × ${item.quantity}${item.options ? ` (${item.options})` : ""}`).join(" · ")}</dd></div>}</dl>
    {request.quote && <section className={styles.quote}><h4>Provider quote</h4><div><span>Full price <strong>{money(request.quote.fullPrice)}</strong></span><span>Deposit <strong>{money(request.quote.depositAmount)}</strong></span></div><p><b>Includes:</b> {request.quote.inclusions}</p><p><b>Cancellation:</b> {request.quote.cancellationTerms}</p>{request.quote.acceptedAt && <p className={styles.accepted}>Customer accepted and recorded direct-provider payment acknowledgment.</p>}</section>}
    {providerView && (request.status === "waiting_for_reply" || (request.status === "quoted" && !request.quote?.acceptedAt)) && <form className={styles.quoteForm} onSubmit={(event) => void quote(event)}><h4>{request.quote ? "Update quote" : "Send quote"}</h4><label>Full price<input required name="price" type="number" min="0" step="0.01" defaultValue={request.quote?.fullPrice} /></label><label>Deposit<input required name="deposit" type="number" min="0" step="0.01" defaultValue={request.quote?.depositAmount} /></label><label>What is included<textarea required minLength={10} name="inclusions" defaultValue={request.quote?.inclusions} /></label><label>Cancellation terms<textarea required minLength={10} name="cancellation" defaultValue={request.quote?.cancellationTerms} /></label><button disabled={busy} className={styles.primary}>Send quote</button></form>}
    <div className={styles.actions}>{!providerView && request.status === "quoted" && request.quote && !request.quote.acceptedAt && <button disabled={busy || !request.quote.revision} className={styles.primary} onClick={() => void action("accept_provider_quote", { p_request_id: request.id, p_expected_revision: request.quote?.revision, p_direct_payment_acknowledged: true }, "Quote accepted. The provider must still confirm the booking.")}>Accept quote and acknowledge direct payment</button>}{providerView && request.status === "quoted" && request.quote?.acceptedAt && <button disabled={busy} className={styles.primary} onClick={() => void action("confirm_provider_request", { p_request_id: request.id }, "Provider booking confirmed.")}>Confirm booking</button>}{providerView && (request.status === "waiting_for_reply" || request.status === "quoted") && <button disabled={busy} className={styles.secondary} onClick={() => void action("decline_provider_request", { p_request_id: request.id }, "Request declined.")}>Decline</button>}{request.status !== "closed" && <button disabled={busy} className={styles.secondary} onClick={() => void action("close_provider_request", { p_request_id: request.id }, "Request closed.")}>Close</button>}</div>
    <section className={styles.messages}><h4>Messages</h4>{request.messages.length ? request.messages.map((item) => <p key={item.id} className={item.senderId === userId ? styles.mine : ""}><b>{item.senderId === userId ? "You" : providerView ? "Customer" : "Provider"}</b>{item.body}</p>) : <span>No messages yet.</span>}<form onSubmit={(event) => void message(event)}><label><span className="sr-only">Message</span><input required maxLength={2000} name="message" placeholder="Write a message" /></label><button disabled={busy} className={styles.secondary}>Send</button></form></section>
  </article>;
}

function RequestStatus({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) { return <section className={styles.empty} role="status"><h2>{title}</h2><p>{body}</p>{children}</section>; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
