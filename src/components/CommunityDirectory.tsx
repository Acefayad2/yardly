"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { COMMUNITY_SPACE_SELECT, communitySpacePayload, isCommunitySpaceStale, mapCommunitySpace, type CommunitySpace } from "@/lib/community-spaces";
import styles from "./CommunityDirectory.module.css";

type Notice = { kind: "error" | "success"; text: string } | null;
export default function CommunityDirectory() {
  const { user, authLoading } = useStore();
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [staffMode, setStaffMode] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const result = await supabase.from("community_spaces").select(COMMUNITY_SPACE_SELECT).order("last_checked_at", { ascending: false });
      if (result.error) throw result.error;
      setSpaces((result.data ?? []).map((row) => mapCommunitySpace(row as Record<string, unknown>)));
      if (user) { const staff = await supabase.from("marketplace_staff").select("user_id").eq("user_id", user.id).maybeSingle(); if (staff.error) throw staff.error; setIsStaff(Boolean(staff.data)); }
      else setIsStaff(false);
    } catch (error) { setNotice({ kind: "error", text: errorMessage(error, "load community directory") }); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!authLoading) queueMicrotask(() => void load()); }, [authLoading, load]);
  const publicSpaces = useMemo(() => spaces.filter((space) => space.published), [spaces]);
  if (loading || authLoading) return <Status title="Loading community spaces…" body="Checking official source records." />;
  return <main className={styles.page}>
    <header className={styles.hero}><div><p>Curated public directory</p><h1>Official community spaces, with a freshness check.</h1><span>Yardly shows source details and never pretends an official reservation is complete. Recheck the venue before applying.</span></div><Link href="/churches">Browse churches</Link></header>
    {isStaff && <button className={styles.staffToggle} onClick={() => setStaffMode(!staffMode)}>{staffMode ? "View public directory" : "Manage directory"}</button>}
    {notice && <div className={notice.kind === "error" ? styles.error : styles.success} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
    {staffMode && isStaff ? <StaffDirectory spaces={spaces} onChanged={load} onNotice={setNotice} /> : <PublicDirectory spaces={publicSpaces} />}
  </main>;
}

function PublicDirectory({ spaces }: { spaces: CommunitySpace[] }) {
  return <section><Heading eyebrow="Selected resources" title="Community-space directory" />{!spaces.length ? <Status title="No verified community spaces yet" body="Entries appear only after staff checks an approved official source and publishes the record." /> : <div className={styles.grid}>{spaces.map((space) => { const stale = isCommunitySpaceStale(space.lastCheckedAt) || !space.officialUrl; return <article className={styles.card} key={space.id}><div className={styles.cardTop}><span>{space.type.replaceAll("_", " ")}</span><b className={stale ? styles.stale : styles.current}>{stale ? "Recheck required" : "Checked this week"}</b></div><h2>{space.name}</h2><p>{space.location}{space.capacity ? ` · Capacity ${space.capacity}` : " · Capacity not published"}</p><dl><div><dt>Published pricing</dt><dd>{space.publishedPricing}</dd></div><div><dt>Amenities</dt><dd>{space.amenities.join(" · ")}</dd></div><div><dt>Restrictions</dt><dd>{space.restrictions}</dd></div><div><dt>Official source</dt><dd>{space.sourceName}</dd></div><div><dt>Last checked</dt><dd>{space.lastCheckedAt ? new Date(space.lastCheckedAt).toLocaleDateString() : "Not yet checked"}</dd></div></dl>{stale ? <p className={styles.gate}>The official reservation link is paused until Yardly rechecks this entry.</p> : <a className={styles.official} href={space.officialUrl} target="_blank" rel="noreferrer">Continue to official reservation process</a>}</article>; })}</div>}</section>;
}

function StaffDirectory({ spaces, onChanged, onNotice }: { spaces: CommunitySpace[]; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CommunitySpace | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); if (!editing && form.get("verified") !== "yes") { onNotice({ kind: "error", text: "Confirm you checked the official source today." }); return; } setBusy(true); try { const supabase = getSupabase(); const saved = await supabase.rpc("save_community_space", communitySpacePayload(form, editing?.id ?? null)); if (saved.error) throw saved.error; const savedRow = saved.data as { id?: string; content_revision?: number } | null; const id = String(savedRow?.id ?? ""); const revision = Number(savedRow?.content_revision ?? 0); if (!id || revision < 1) throw new Error("The directory entry did not return its saved revision."); if (editing) { onNotice({ kind: "success", text: "Corrections saved and publication invalidated. Recheck the official source before publishing." }); setEditing(null); } else { const checked = await supabase.rpc("record_community_space_check", { p_space_id: id, p_expected_revision: revision, p_source_status: "current", p_check_note: String(form.get("checkNote")) }); if (checked.error) throw checked.error; const published = await supabase.rpc("set_community_space_published", { p_space_id: id, p_published: true }); if (published.error) throw published.error; onNotice({ kind: "success", text: "Verified community-space entry published." }); formElement.reset(); } await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, editing ? "correct community space" : "publish community space") }); } finally { setBusy(false); } }
  async function recheck(space: CommunitySpace, status: "current" | "changed" | "unavailable") { try { const supabase = getSupabase(); const checked = await supabase.rpc("record_community_space_check", { p_space_id: space.id, p_expected_revision: space.contentRevision, p_source_status: status, p_check_note: status === "current" ? "Official source rechecked; displayed details remain current." : `Official source marked ${status}; entry unpublished for review.` }); if (checked.error) throw checked.error; if (status === "current" && !space.published) { const published = await supabase.rpc("set_community_space_published", { p_space_id: space.id, p_published: true }); if (published.error) throw published.error; } onNotice({ kind: "success", text: status === "current" ? "Entry rechecked and available." : "Entry unpublished pending correction." }); await onChanged(); } catch (error) { onNotice({ kind: "error", text: errorMessage(error, "recheck community space") }); } }
  return <section><Heading eyebrow="Staff source review" title="Directory management" /><div className={styles.staffLayout}><form key={editing?.id ?? "new"} className={styles.form} onSubmit={(event) => void submit(event)}><h2 className={styles.wide}>{editing ? `Correct ${editing.name}` : "Add a verified entry"}</h2><label>Name<input required name="name" defaultValue={editing?.name} /></label><label>Type<select name="type" defaultValue={editing?.type ?? "park"}><option value="park">Park</option><option value="gym">Gym</option><option value="recreation_center">Recreation center</option><option value="community_center">Community center</option><option value="other">Other</option></select></label><label>Location<input required name="location" defaultValue={editing?.location} /></label><label>Capacity, if published<input min="1" name="capacity" type="number" defaultValue={editing?.capacity ?? ""} /></label><label className={styles.wide}>Amenities, comma separated<input required name="amenities" defaultValue={editing?.amenities.join(", ")} /></label><label className={styles.wide}>Published pricing<textarea required name="pricing" defaultValue={editing?.publishedPricing} /></label><label className={styles.wide}>Restrictions<textarea required name="restrictions" defaultValue={editing?.restrictions} /></label><label>Official HTTPS URL<input required name="officialUrl" type="url" defaultValue={editing?.officialUrl} /></label><label>Official source name<input required name="sourceName" defaultValue={editing?.sourceName} /></label>{!editing && <><label className={styles.wide}>Verification note<textarea required minLength={3} name="checkNote" /></label><label className={styles.check}><input name="verified" type="checkbox" value="yes" /> I checked this official source today.</label></>}<button disabled={busy} className={styles.official}>{editing ? "Save corrections and require recheck" : "Verify and publish"}</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</form><div className={styles.queue}><h2>Weekly recheck queue</h2>{!spaces.length ? <p>No entries yet.</p> : spaces.map((space) => <article key={space.id}><b>{space.name}</b><span>{isCommunitySpaceStale(space.lastCheckedAt) ? "Recheck due" : "Current"} · {space.published ? "Published" : "Unpublished"}</span><div><button onClick={() => setEditing(space)}>Edit details</button><button onClick={() => void recheck(space, "current")}>Still current</button><button onClick={() => void recheck(space, "changed")}>Details changed</button><button onClick={() => void recheck(space, "unavailable")}>Source unavailable</button></div></article>)}</div></div></section>;
}
function Heading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className={styles.heading}><p>{eyebrow}</p><h2>{title}</h2></div>; }
function Status({ title, body }: { title: string; body: string }) { return <section className={styles.status} role="status"><h2>{title}</h2><p>{body}</p></section>; }
