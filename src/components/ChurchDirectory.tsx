"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { CHURCH_REQUEST_SELECT, CHURCH_SELECT, churchListingPayload, churchListingUpdatePayload, mapChurchListing, mapChurchRequest, validateChurchListing, type ChurchEventRequest, type ChurchListing } from "@/lib/churches";
import styles from "./ChurchDirectory.module.css";

type View = "discover" | "list" | "requests" | "review";
type Notice = { kind: "error" | "success"; text: string } | null;

export default function ChurchDirectory() {
  return <Suspense fallback={<Status title="Loading church spaces…" body="Opening the church directory." />}><ChurchDirectoryContent /></Suspense>;
}

function ChurchDirectoryContent() {
  const params = useSearchParams();
  const { user, authLoading, setAuthOpen } = useStore();
  const [view, setView] = useState<View>("discover");
  const [listings, setListings] = useState<ChurchListing[]>([]);
  const [requests, setRequests] = useState<ChurchEventRequest[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const selectedId = params.get("church");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const listingResult = await supabase.from("church_listings").select(CHURCH_SELECT).order("reviewed_at", { ascending: false });
      if (listingResult.error) throw listingResult.error;
      let mappedListings = (listingResult.data ?? []).map((row) => mapChurchListing(row as Record<string, unknown>));
      if (user) {
        const [staffResult, requestResult, permissionResult, reviewResult] = await Promise.all([
          supabase.from("marketplace_staff").select("user_id").eq("user_id", user.id).maybeSingle(),
          supabase.from("church_event_requests").select(CHURCH_REQUEST_SELECT).order("updated_at", { ascending: false }),
          supabase.from("church_photo_permissions").select("church_id,permission_granted,permission_statement"),
          supabase.from("church_listing_reviews").select("church_id,review_note"),
        ]);
        if (staffResult.error) throw staffResult.error;
        if (requestResult.error) throw requestResult.error;
        if (permissionResult.error) throw permissionResult.error;
        if (reviewResult.error) throw reviewResult.error;
        const permissions = new Map((permissionResult.data ?? []).map((row) => [String(row.church_id), row]));
        const reviews = new Map((reviewResult.data ?? []).map((row) => [String(row.church_id), row]));
        mappedListings = mappedListings.map((listing) => ({ ...listing, photoPermissionGranted: permissions.get(listing.id)?.permission_granted === true, photoPermissionStatement: String(permissions.get(listing.id)?.permission_statement ?? ""), reviewNote: String(reviews.get(listing.id)?.review_note ?? "") }));
        setIsStaff(Boolean(staffResult.data));
        setRequests((requestResult.data ?? []).map((row) => mapChurchRequest(row as Record<string, unknown>)));
      } else { setIsStaff(false); setRequests([]); }
      setListings(mappedListings);
    } catch (error) { setNotice({ kind: "error", text: errorMessage(error, "load church spaces") }); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (!authLoading) queueMicrotask(() => void load()); }, [authLoading, load]);
  const publicListings = useMemo(() => listings.filter((item) => item.reviewState === "approved" && item.ownerApprovedAt), [listings]);
  const visibleListings = selectedId ? publicListings.filter((item) => item.id === selectedId) : publicListings;
  if (authLoading || loading) return <Status title="Loading church spaces…" body="Checking approved listings and private requests." />;

  return <main className={styles.page}>
    <header className={styles.hero}><div><p>Participating churches</p><h1>Gather in spaces rooted in community.</h1><span>Churches approve their own listing and every event request. They collect their own payments directly.</span></div><Link href="/community">Explore public spaces</Link></header>
    <nav className={styles.tabs} aria-label="Church directory">
      <button className={view === "discover" ? styles.active : ""} onClick={() => setView("discover")}>Discover</button>
      <button className={view === "list" ? styles.active : ""} onClick={() => setView("list")}>List a church space</button>
      {user && <button className={view === "requests" ? styles.active : ""} onClick={() => setView("requests")}>Requests</button>}
      {isStaff && <button className={view === "review" ? styles.active : ""} onClick={() => setView("review")}>Review</button>}
    </nav>
    {notice && <div className={notice.kind === "error" ? styles.error : styles.success} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
    {view === "discover" && <section><Heading eyebrow="Church spaces" title={selectedId ? "Shared church listing" : "Reviewed spaces"} />{!visibleListings.length ? <Status title="No approved church spaces yet" body="Listings appear only after church approval, recorded photo permission, and staff review." /> : <div className={styles.grid}>{visibleListings.map((listing) => <ChurchCard key={listing.id} listing={listing} user={Boolean(user)} onSignIn={() => setAuthOpen(true)} onChanged={load} onNotice={setNotice} />)}</div>}</section>}
    {view === "list" && (!user ? <Status title="Sign in to list a church space" body="A church representative must approve the listing and record photo permission before review."><button className={styles.primary} onClick={() => setAuthOpen(true)}>Sign in</button></Status> : <ChurchOwnerWorkspace userId={user.id} listings={listings.filter((listing) => listing.ownerId === user.id)} onChanged={load} onNotice={setNotice} />)}
    {view === "requests" && <RequestWorkspace requests={requests} userId={user?.id ?? ""} onChanged={load} onNotice={setNotice} />}
    {view === "review" && isStaff && <ReviewQueue listings={listings.filter((item) => item.reviewState === "pending")} onChanged={load} onNotice={setNotice} />}
  </main>;
}

function ChurchCard({ listing, user, onSignIn, onChanged, onNotice }: { listing: ChurchListing; user: boolean; onSignIn: () => void; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [open, setOpen] = useState(false);
  return <article className={styles.card}><div className={styles.photo} style={{ backgroundImage: `url(${listing.photoUrls[0]})` }} /><div className={styles.cardBody}><span>{listing.churchName}</span><h2>{listing.spaceName}</h2><p>{listing.location} · Up to {listing.capacity} guests</p><p>{listing.description}</p><dl><div><dt>Published price</dt><dd>{listing.publishedPrice}</dd></div><div><dt>Amenities</dt><dd>{listing.amenities.join(" · ")}</dd></div><div><dt>Rules</dt><dd>{listing.rules}</dd></div><div><dt>Booking contact</dt><dd>{listing.bookingContactName}</dd></div></dl><div className={styles.actions}><Link href={`/churches/?church=${encodeURIComponent(listing.id)}`}>Shareable listing link</Link><button className={styles.primary} onClick={() => user ? setOpen(!open) : onSignIn()}>Request this space</button></div>{open && <ChurchRequestForm churchId={listing.id} onChanged={onChanged} onNotice={onNotice} />}</div></article>;
}

function ChurchRequestForm({ churchId, onChanged, onNotice }: { churchId: string; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); try { const result = await getSupabase().rpc("create_church_event_request", { p_church_id: churchId, p_event_date: String(form.get("date")), p_start_time: String(form.get("start")), p_end_time: String(form.get("end")), p_guest_count: Number(form.get("guests")), p_event_type: String(form.get("type")), p_details: String(form.get("details")) }); if (result.error) throw result.error; onNotice({ kind: "success", text: "Request sent. The church must accept it; no booking or payment was created." }); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "send church request") }); } finally { setBusy(false); } }
  return <form className={styles.form} onSubmit={(event) => void submit(event)}><label>Date<input required name="date" type="date" /></label><label>Guests<input required min="1" name="guests" type="number" /></label><label>Start<input required name="start" type="time" /></label><label>End<input required name="end" type="time" /></label><label>Event type<input required name="type" /></label><label className={styles.wide}>Event details<textarea required minLength={10} name="details" /></label><button disabled={busy} className={styles.primary}>Send request</button></form>;
}

function ChurchOwnerWorkspace({ userId, listings, onChanged, onNotice }: { userId: string; listings: ChurchListing[]; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = listings.find((listing) => listing.id === selectedId) ?? null;
  async function revoke(listing: ChurchListing) { try { const result = await getSupabase().rpc("record_church_photo_permission", { p_church_id: listing.id, p_permission_granted: false, p_permission_statement: "Photo permission withdrawn by the church representative; remove photos from Yardly publication." }); if (result.error) throw result.error; onNotice({ kind: "success", text: "Photo permission revoked. The listing is private and returned to draft." }); setSelectedId(listing.id); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "revoke church photo permission") }); } }
  return <section><Heading eyebrow="Church-owned listings" title="Drafts, reviews, and permissions" />{listings.length > 0 && <div className={styles.requestList}>{listings.map((listing) => <article className={styles.request} key={listing.id}><span>{listing.reviewState}</span><h2>{listing.churchName} · {listing.spaceName}</h2><p>Photo permission: {listing.photoPermissionGranted ? "Recorded" : "Revoked or missing"}</p>{listing.reviewNote && <p><b>Staff review note:</b> {listing.reviewNote}</p>}<div className={styles.actions}>{["draft", "rejected"].includes(listing.reviewState) && <button onClick={() => setSelectedId(listing.id)}>Edit and resubmit</button>}{listing.photoPermissionGranted && <button onClick={() => void revoke(listing)}>Revoke photo permission</button>}</div></article>)}</div>}<button className={styles.primary} onClick={() => setSelectedId(null)}>Create another church listing</button><ChurchForm key={selected?.id ?? "new"} userId={userId} listing={selected} onChanged={onChanged} onNotice={onNotice} /></section>;
}

function ChurchForm({ userId, listing, onChanged, onNotice }: { userId: string; listing: ChurchListing | null; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const permission = String(form.get("permission") ?? ""); const insertPayload = churchListingPayload(userId, form); const errors = validateChurchListing(insertPayload, permission); if (errors.length) { onNotice({ kind: "error", text: errors.join(" ") }); return; } setBusy(true); try { const supabase = getSupabase(); const saved = listing ? await supabase.from("church_listings").update(churchListingUpdatePayload(form)).eq("id", listing.id).select("id").single() : await supabase.from("church_listings").insert(insertPayload).select("id").single(); if (saved.error) throw saved.error; const churchId = String(saved.data.id); const recorded = await supabase.rpc("record_church_photo_permission", { p_church_id: churchId, p_permission_granted: true, p_permission_statement: permission }); if (recorded.error) throw recorded.error; const submitted = await supabase.rpc("submit_church_listing", { p_church_id: churchId }); if (submitted.error) throw submitted.error; onNotice({ kind: "success", text: listing ? "Corrected church listing resubmitted for staff review." : "Church-approved listing submitted for staff review." }); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "submit church listing") }); } finally { setBusy(false); } }
  return <section className={styles.panel}><Heading eyebrow="Church-owned listing" title={listing ? "Correct and resubmit this space" : "Prepare and approve a space"} />{listing?.reviewNote && <p><b>Staff review note:</b> {listing.reviewNote}</p>}<p>Submitting confirms the church approves this exact copy and grants the recorded photo permission.</p><form className={styles.form} onSubmit={(event) => void submit(event)}><label>Church name<input required name="churchName" defaultValue={listing?.churchName} /></label><label>Space name<input required name="spaceName" defaultValue={listing?.spaceName} /></label><label>Location<input required name="location" defaultValue={listing?.location} /></label><label>Capacity<input required min="1" name="capacity" type="number" defaultValue={listing?.capacity} /></label><label>Published price<input required name="price" placeholder="$100 per hour" defaultValue={listing?.publishedPrice} /></label><label>Booking contact name<input required name="contact" defaultValue={listing?.bookingContactName} /></label><label className={styles.wide}>Description<textarea required minLength={40} name="description" defaultValue={listing?.description} /></label><label className={styles.wide}>Amenities, comma separated<input required name="amenities" defaultValue={listing?.amenities.join(", ")} /></label><label className={styles.wide}>Rules<textarea required minLength={10} name="rules" defaultValue={listing?.rules} /></label><label className={styles.wide}>Approved HTTPS photo URLs, one per line<textarea required name="photos" defaultValue={listing?.photoUrls.join("\n")} /></label><label className={styles.wide}>Photo-permission record<textarea required minLength={10} name="permission" defaultValue={listing?.photoPermissionStatement} placeholder="Authorized by… on… for Yardly publication" /></label><button disabled={busy} className={styles.primary}>{listing ? "Approve corrections and resubmit" : "Approve and submit for review"}</button></form></section>;
}

function RequestWorkspace({ requests, userId, onChanged, onNotice }: { requests: ChurchEventRequest[]; userId: string; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  async function act(name: string, args: Record<string, unknown>, text: string) { try { const result = await getSupabase().rpc(name, args); if (result.error) throw result.error; onNotice({ kind: "success", text }); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "update church request") }); } }
  return <section><Heading eyebrow="Separate church decisions" title="Event requests" />{!requests.length ? <Status title="No church requests yet" body="Requests appear here for customers and church owners." /> : <div className={styles.requestList}>{requests.map((request) => { const owner = request.churchOwnerId === userId; return <article className={styles.request} key={request.id}><span>{request.status.replaceAll("_", " ")}</span><h2>{request.churchName} · {request.spaceName}</h2><p>{request.eventDate} · {request.startTime}–{request.endTime} · {request.guestCount} guests</p><p><b>{request.eventType}</b> — {request.details}</p><div className={styles.actions}>{owner && request.status === "waiting_for_reply" && <><button className={styles.primary} onClick={() => void act("decide_church_event_request", { p_request_id: request.id, p_decision: "accepted" }, "Church accepted the request. Payment remains directly with the church.")}>Accept request</button><button onClick={() => void act("decide_church_event_request", { p_request_id: request.id, p_decision: "declined" }, "Request declined.")}>Decline</button></>}{request.status !== "closed" && <button onClick={() => void act("close_church_event_request", { p_request_id: request.id }, "Request closed.")}>Close</button>}</div></article>; })}</div>}</section>;
}

function ReviewQueue({ listings, onChanged, onNotice }: { listings: ChurchListing[]; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  async function decide(id: string, decision: "approved" | "rejected", note: string) { try { const result = await getSupabase().rpc("review_church_listing", { p_church_id: id, p_decision: decision, p_review_note: note }); if (result.error) throw result.error; onNotice({ kind: "success", text: `Church listing ${decision}.` }); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "review church listing") }); } }
  return <section><Heading eyebrow="Staff review" title="Church approval queue" />{!listings.length ? <Status title="Review queue is clear" body="Church-approved listings with recorded photo permission appear here." /> : listings.map((listing) => <ReviewCard key={listing.id} listing={listing} onDecide={decide} />)}</section>;
}
function ReviewCard({ listing, onDecide }: { listing: ChurchListing; onDecide: (id: string, decision: "approved" | "rejected", note: string) => Promise<void> }) { const [note, setNote] = useState(""); return <article className={styles.request}><h2>{listing.churchName} · {listing.spaceName}</h2><p>Owner approved: {listing.ownerApprovedAt ? "Yes" : "No"} · Photo permission: {listing.photoPermissionGranted ? "Recorded" : "Missing"}</p><dl><div><dt>Location and capacity</dt><dd>{listing.location} · {listing.capacity} guests</dd></div><div><dt>Proposed copy</dt><dd>{listing.description}</dd></div><div><dt>Published price</dt><dd>{listing.publishedPrice}</dd></div><div><dt>Amenities</dt><dd>{listing.amenities.join(" · ")}</dd></div><div><dt>Rules</dt><dd>{listing.rules}</dd></div><div><dt>Booking contact</dt><dd>{listing.bookingContactName}</dd></div><div><dt>Permission evidence</dt><dd>{listing.photoPermissionStatement || "Missing"}</dd></div><div><dt>Proposed photos</dt><dd>{listing.photoUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Photo {index + 1}</a>)}</dd></div></dl><textarea aria-label={`Review note for ${listing.churchName}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required when returning the listing" /><div className={styles.actions}><button className={styles.primary} onClick={() => void onDecide(listing.id, "approved", "")}>Approve reviewed listing</button><button onClick={() => void onDecide(listing.id, "rejected", note)}>Return with note</button></div></article>; }
function Heading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className={styles.heading}><p>{eyebrow}</p><h2>{title}</h2></div>; }
function Status({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) { return <section className={styles.status} role="status"><h2>{title}</h2><p>{body}</p>{children}</section>; }
