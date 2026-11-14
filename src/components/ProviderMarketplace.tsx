"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  PROVIDER_PROFILE_SELECT,
  commaList,
  mapProviderProfile,
  providerInsertPayload,
  providerUpdatePayload,
  validateProviderDraft,
  type EquipmentItem,
  type ProviderProfile,
  type ProviderProfileDraft,
  type ProviderReviewState,
} from "@/lib/provider-marketplace";
import styles from "./ProviderMarketplace.module.css";

type View = "discover" | "provider" | "review";
type Notice = { kind: "error" | "success"; text: string } | null;

const EMPTY_DRAFT: ProviderProfileDraft = {
  kind: "service",
  businessName: "",
  category: "Photography",
  serviceArea: "",
  summary: "",
  offerings: [],
  startingPrice: 0,
  sampleUrls: [],
  deliveryDetails: "",
  setupDetails: "",
  pickupDetails: "",
  inventory: [],
};

export default function ProviderMarketplace() {
  const { user, authLoading, setAuthOpen } = useStore();
  const [view, setView] = useState<View>("discover");
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [ownProfile, setOwnProfile] = useState<ProviderProfile | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ProviderProfile[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const publicResult = await supabase.from("provider_profiles").select(PROVIDER_PROFILE_SELECT).eq("review_state", "approved").order("reviewed_at", { ascending: false });
      if (publicResult.error) throw publicResult.error;
      setProfiles((publicResult.data ?? []).map((row) => mapProviderProfile(row as Record<string, unknown>)));

      if (!user) {
        setOwnProfile(null);
        setIsStaff(false);
        setReviewQueue([]);
        return;
      }

      const [ownResult, staffResult] = await Promise.all([
        supabase.from("provider_profiles").select(PROVIDER_PROFILE_SELECT).eq("owner_id", user.id).maybeSingle(),
        supabase.from("marketplace_staff").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (ownResult.error) throw ownResult.error;
      if (staffResult.error) throw staffResult.error;
      let mappedOwnProfile = ownResult.data ? mapProviderProfile(ownResult.data as Record<string, unknown>) : null;
      if (mappedOwnProfile) {
        const noteResult = await supabase.from("provider_profile_reviews").select("review_note").eq("profile_id", mappedOwnProfile.id).maybeSingle();
        if (noteResult.error) throw noteResult.error;
        mappedOwnProfile = { ...mappedOwnProfile, reviewNote: String(noteResult.data?.review_note ?? "") };
      }
      setOwnProfile(mappedOwnProfile);
      const staff = Boolean(staffResult.data);
      setIsStaff(staff);
      if (staff) {
        const queueResult = await supabase.from("provider_profiles").select(PROVIDER_PROFILE_SELECT).eq("review_state", "pending").order("submitted_at", { ascending: true });
        if (queueResult.error) throw queueResult.error;
        setReviewQueue((queueResult.data ?? []).map((row) => mapProviderProfile(row as Record<string, unknown>)));
      } else setReviewQueue([]);
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error, "load event providers") });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) queueMicrotask(() => void load());
  }, [authLoading, load]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Services &amp; rentals</h1>
      <nav className={styles.tabs} aria-label="Services marketplace">
        <Tab active={view === "discover"} onClick={() => setView("discover")}>Discover</Tab>
        <Tab active={view === "provider"} onClick={() => setView("provider")}>List your business</Tab>
        {user && <Link href="/services/requests">My requests</Link>}
        {isStaff && <Tab active={view === "review"} onClick={() => setView("review")}>Review queue ({reviewQueue.length})</Tab>}
      </nav>

      {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? styles.error : styles.success}>{notice.text}</div>}
      {loading ? <Status title="Loading services…" body="Checking the latest reviewed providers." /> : view === "discover" ? (
        <Directory profiles={profiles} />
      ) : view === "provider" ? (
        user ? <ProviderEditor userId={user.id} profile={ownProfile} onSaved={load} onNotice={setNotice} /> : <Status title="Sign in to list a business" body="Your account keeps the draft private while Yardly reviews it."><button className={styles.primary} onClick={() => setAuthOpen(true)}>Sign in</button></Status>
      ) : (
        <ReviewQueue profiles={reviewQueue} onReviewed={load} onNotice={setNotice} />
      )}
      {view === "discover" && <aside className={styles.quoteNote}>
        <strong>How quotes work</strong>
        <p>Tell a provider about your event. They’ll send pricing and availability. You arrange payment directly with them.</p>
      </aside>}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-current={active ? "page" : undefined} className={active ? styles.activeTab : ""} onClick={onClick}>{children}</button>;
}

function Directory({ profiles }: { profiles: ProviderProfile[] }) {
  const [selected, setSelected] = useState("all");
  const categories = new Map([
    ["all", { label: "All", icon: "✨" }],
    ["photography", { label: "Photography", icon: "📷" }],
    ["catering", { label: "Catering", icon: "🍽️" }],
    ["music", { label: "Music", icon: "🎵" }],
    ["decor", { label: "Decor", icon: "🌷" }],
    ["equipment", { label: "Rentals", icon: "🪑" }],
  ]);
  function categoryKey(profile: ProviderProfile) {
    if (profile.kind === "equipment") return "equipment";
    const key = profile.category.trim().toLowerCase();
    if (key === "dj" || key === "djs" || key === "live music") return "music";
    if (key === "décor") return "decor";
    return key === "all" || key === "equipment" ? `service-${key}` : key;
  }
  for (const profile of profiles) {
    const key = categoryKey(profile);
    if (!categories.has(key)) categories.set(key, { label: profile.category, icon: "🛎️" });
  }
  const visible = profiles.filter(profile => selected === "all" || categoryKey(profile) === selected);
  const category = categories.get(selected);
  return <section aria-label="Service directory">
    <div className={styles.categoryBar} role="group" aria-label="Filter by service">
      {Array.from(categories, ([key, item]) => <button type="button" key={key} aria-pressed={selected === key} onClick={() => setSelected(key)}>
        <span aria-hidden="true">{item.icon}</span>{item.label}
      </button>)}
    </div>
    <h2 className={styles.resultsTitle}>{selected === "all" ? "All services" : category?.label}</h2>
    {!visible.length ? <div className={styles.empty} role="status">
      <h3>{selected === "all" ? "No reviewed providers yet" : "No providers in this category yet"}</h3>
      <p>{selected === "all" ? "Providers will appear here once Yardly reviews their business." : "Check back soon or browse the other services."}</p>
      {selected !== "all" && <button type="button" onClick={() => setSelected("all")}>See all services</button>}
    </div> : <div className={styles.grid}>{visible.map(profile => <ProviderCard key={profile.id} profile={profile} />)}</div>}
  </section>;
}

function ProviderCard({ profile }: { profile: ProviderProfile }) {
  return <article className={styles.card}>
    {profile.sampleUrls[0] && <div className={styles.sample} role="img" aria-label={`${profile.businessName} work sample`} style={{ backgroundImage: `url(${JSON.stringify(profile.sampleUrls[0]).slice(1, -1)})` }} />}
    <div className={styles.cardBody}>
      <span className={styles.badge}>{profile.kind === "equipment" ? "Equipment rental" : profile.category}</span>
      <h3>{profile.businessName}</h3><p className={styles.area}>Serves {profile.serviceArea}</p><p>{profile.summary}</p>
      <ul>{profile.offerings.map((offering) => <li key={offering}>{offering}</li>)}</ul>
      {profile.kind === "equipment" && <><p className={styles.label}>Available equipment</p><p>{profile.inventory.map((item) => `${item.name} (${item.quantityAvailable})`).join(" · ")}</p><dl className={styles.details}><div><dt>Delivery</dt><dd>{profile.deliveryDetails}</dd></div><div><dt>Setup</dt><dd>{profile.setupDetails}</dd></div><div><dt>Pickup</dt><dd>{profile.pickupDetails}</dd></div></dl></>}
      <div className={styles.cardFooter}><span>Starting at <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(profile.startingPrice)}</strong></span><Link href={`/services/requests/?provider=${encodeURIComponent(profile.id)}`}>Request a separate quote</Link></div>
    </div>
  </article>;
}

function ProviderEditor({ userId, profile, onSaved, onNotice }: { userId: string; profile: ProviderProfile | null; onSaved: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [draft, setDraft] = useState<ProviderProfileDraft>(() => profile ? fromProfile(profile) : EMPTY_DRAFT);
  const [offerings, setOfferings] = useState(profile?.offerings.join(", ") ?? "");
  const [samples, setSamples] = useState(profile?.sampleUrls.join("\n") ?? "");
  const [inventory, setInventory] = useState(profile?.inventory.map((item) => `${item.name}: ${item.quantityAvailable}`).join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const locked = profile?.reviewState === "pending" || profile?.reviewState === "approved";

  async function save(submit: boolean) {
    const next = { ...draft, offerings: commaList(offerings), sampleUrls: samples.split(/\n/).map((item) => item.trim()).filter(Boolean), inventory: parseInventory(inventory) };
    const errors = validateProviderDraft(next);
    if (errors.length) { onNotice({ kind: "error", text: errors.join(" ") }); return; }
    setSaving(true); onNotice(null);
    try {
      const supabase = getSupabase();
      const profileResult = profile
        ? await supabase.from("provider_profiles").update(providerUpdatePayload(next)).eq("id", profile.id).select("id").single()
        : await supabase.from("provider_profiles").insert(providerInsertPayload(userId, next)).select("id").single();
      if (profileResult.error) throw profileResult.error;
      const profileId = String(profileResult.data.id);
      if (next.kind === "equipment") {
        const remove = await supabase.from("provider_inventory_items").delete().eq("provider_id", profileId);
        if (remove.error) throw remove.error;
        const added = await supabase.from("provider_inventory_items").insert(next.inventory.map((item) => ({ provider_id: profileId, name: item.name, quantity_available: item.quantityAvailable })));
        if (added.error) throw added.error;
      }
      if (submit) {
        const submitted = await supabase.rpc("submit_provider_profile", { p_profile_id: profileId });
        if (submitted.error) throw submitted.error;
      }
      onNotice({ kind: "success", text: submit ? "Profile submitted for staff review. It is not public yet." : "Private draft saved." });
      await onSaved();
    } catch (error) {
      onNotice({ kind: "error", text: errorMessage(error, "save provider profile") });
      await onSaved();
    }
    finally { setSaving(false); }
  }

  if (locked) return <Status title={profile.reviewState === "approved" ? "Your profile is live" : "Review in progress"} body={profile.reviewState === "approved" ? "Customers can now find this profile. Contact Yardly staff before changing approved content." : "The profile is locked while Yardly checks its samples, service area, pricing, and offering details."} />;
  return <section className={styles.editor} aria-labelledby="provider-editor-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Provider profile</p><h2 id="provider-editor-heading">{profile ? "Update your submission" : "List your business"}</h2></div>{profile && <StateBadge state={profile.reviewState} />}</div>
    {profile?.reviewNote && <div className={styles.reviewNote}><strong>Staff note</strong><p>{profile.reviewNote}</p></div>}
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void save(false); }} className={styles.form}>
      <Field label="Business type"><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ProviderProfileDraft["kind"] })}><option value="service">Event professional</option><option value="equipment">Equipment rental</option></select></Field>
      <Field label="Business name"><input required minLength={2} value={draft.businessName} onChange={(event) => setDraft({ ...draft, businessName: event.target.value })} /></Field>
      <Field label="Category"><input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Photography" /></Field>
      <Field label="Service area"><input required value={draft.serviceArea} onChange={(event) => setDraft({ ...draft, serviceArea: event.target.value })} placeholder="Washington, DC and nearby Maryland" /></Field>
      <Field label="About the business" wide><textarea required minLength={40} rows={4} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></Field>
      <Field label="Offerings (comma separated)" wide><input required value={offerings} onChange={(event) => setOfferings(event.target.value)} placeholder="Two-hour event coverage, Edited digital gallery" /></Field>
      <Field label="Starting price (USD)"><input required type="number" min="0" step="0.01" value={draft.startingPrice} onChange={(event) => setDraft({ ...draft, startingPrice: Number(event.target.value) })} /></Field>
      <Field label="HTTPS work-sample URLs (one per line)" wide><textarea required rows={3} value={samples} onChange={(event) => setSamples(event.target.value)} /></Field>
      {draft.kind === "equipment" && <>
        <Field label="Equipment and available quantity (one per line)" wide><textarea required rows={3} value={inventory} onChange={(event) => setInventory(event.target.value)} placeholder={"Folding chairs: 60\nSix-foot tables: 10"} /></Field>
        <Field label="Delivery details"><textarea required rows={3} value={draft.deliveryDetails} onChange={(event) => setDraft({ ...draft, deliveryDetails: event.target.value })} /></Field>
        <Field label="Setup details"><textarea required rows={3} value={draft.setupDetails} onChange={(event) => setDraft({ ...draft, setupDetails: event.target.value })} /></Field>
        <Field label="Pickup details"><textarea required rows={3} value={draft.pickupDetails} onChange={(event) => setDraft({ ...draft, pickupDetails: event.target.value })} /></Field>
      </>}
      <div className={styles.actions}><button disabled={saving} className={styles.secondary} type="submit">Save private draft</button><button disabled={saving} className={styles.primary} type="button" onClick={() => void save(true)}>Submit for review</button></div>
    </form>
  </section>;
}

function ReviewQueue({ profiles, onReviewed, onNotice }: { profiles: ProviderProfile[]; onReviewed: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function decide(profileId: string, decision: "approved" | "rejected") {
    setBusy(profileId); onNotice(null);
    try {
      const result = await getSupabase().rpc("review_provider_profile", { p_profile_id: profileId, p_decision: decision, p_review_note: notes[profileId]?.trim() || null });
      if (result.error) throw result.error;
      onNotice({ kind: "success", text: decision === "approved" ? "Profile approved and published." : "Profile returned to the provider with the review note." });
      await onReviewed();
    } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "review provider profile") }); }
    finally { setBusy(null); }
  }
  if (!profiles.length) return <Status title="Review queue is clear" body="New provider submissions will appear here." />;
  return <section><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Staff review</p><h2>Provider submissions</h2></div></div><div className={styles.reviewGrid}>{profiles.map((profile) => <article className={styles.reviewCard} key={profile.id}><ProviderCard profile={profile} /><label>Review note<textarea rows={3} value={notes[profile.id] ?? ""} onChange={(event) => setNotes({ ...notes, [profile.id]: event.target.value })} /></label><div className={styles.actions}><button disabled={busy === profile.id} className={styles.secondary} onClick={() => void decide(profile.id, "rejected")}>Return for changes</button><button disabled={busy === profile.id} className={styles.primary} onClick={() => void decide(profile.id, "approved")}>Approve and publish</button></div></article>)}</div></section>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? styles.wide : ""}><span>{label}</span>{children}</label>; }
function StateBadge({ state }: { state: ProviderReviewState }) { return <span className={styles.state}>{state === "rejected" ? "Changes requested" : state}</span>; }
function Status({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) { return <section className={styles.status} role="status"><h2>{title}</h2><p>{body}</p>{children && <div>{children}</div>}</section>; }

function fromProfile(profile: ProviderProfile): ProviderProfileDraft { return { kind: profile.kind, businessName: profile.businessName, category: profile.category, serviceArea: profile.serviceArea, summary: profile.summary, offerings: profile.offerings, startingPrice: profile.startingPrice, sampleUrls: profile.sampleUrls, deliveryDetails: profile.deliveryDetails, setupDetails: profile.setupDetails, pickupDetails: profile.pickupDetails, inventory: profile.inventory }; }
function parseInventory(value: string): EquipmentItem[] { return value.split(/\n/).map((line) => { const [name, quantity] = line.split(":"); return { name: name?.trim() ?? "", quantityAvailable: Number(quantity?.trim()) }; }).filter((item) => item.name || Number.isFinite(item.quantityAvailable)); }
