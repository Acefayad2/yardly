# Yardly — System Design

Living architecture document. Describes **the `dev` branch exactly as it stands**, not an aspirational
merged state. Last audited 2026-09-24 against the 17 migrations, 9 files under `supabase/tests/`, and
the `src/` tree actually present on `dev`.

Phase 0 (this document), Phase 1 (foundation hardening: the three stacked PRs, an error taxonomy, a
genuine concurrency test, an avatars bucket, CI running on `dev`), and the master brief's own
"Phase 2 — host/listing domain" (archived listings, a capacity-vs-reservation guard, real per-field
publish validation, photo management, a guest-facing preview) are all complete. See §25 and §30.

## Status vocabulary

Every claim in this document carries one of these labels. A feature is never called *implemented*
because its UI exists — only when the enforcing constraint, policy, trigger or function exists.

| Label | Meaning |
|---|---|
| **Implemented** | Exists on `dev` and is enforced where it matters (usually the database) |
| **Partially implemented** | Works for the main path; named gaps remain |
| **Planned** | Agreed, designed, not built |
| **Deferred** | Deliberately postponed; not a gap |
| **Unverified** | Code exists but has never been exercised against real infrastructure |
| **Blocked by dependency** | Cannot proceed until something else lands |

---

## 1. Product definition

Yardly is an hourly marketplace for renting private outdoor spaces — backyards, pools, patios,
gardens, rooftops, sport courts. Guests book by the hour; hosts publish spaces and manage a weekly
schedule. The model is deliberately Airbnb-shaped: one account per person, hosting as a capability
rather than a separate identity.

**Committed end state: a real launch handling real money.** This raises legal, tax, insurance and
data-protection questions from "nice to have" to blocking (§24).

## 2. Decisions of record

Settled 2026-09-23. Recorded so they are not relitigated.

| Decision | Choice | Reasoning |
|---|---|---|
| **End state** | Real launch, real money | Drives everything below; demo-grade shortcuts are not acceptable |
| **Deployment** | Keep `output: "export"`; fix SEO narrowly | The iOS Capacitor app builds from `out/`; abandoning static export breaks it. Server capability comes from Supabase Edge Functions instead — which covers webhooks, secrets and payments fully |
| **Market** | United States / USD | Matches existing demo inventory and code assumptions; best marketplace payout tooling |
| **Reservation lifecycle** | Implement `completed`; **drop** `pending` and `expired` | Both only have meaning alongside a payment hold. Removing them now leaves no dead states; they get re-added deliberately in Phase 7 |

**Corollary worth stating explicitly:** Edge Functions can hold `service_role` safely, so an admin
surface is *not* blocked by the static-export decision. Static export costs us live SSR and
per-request rendering — it does not cost us server capability.

## 3. Architecture — *implemented*

```
 Next.js 16 static export (Turbopack)          ← browser only; no SSR, no route handlers
 ├── StoreProvider (src/lib/store.tsx)         ← single global client state container
 ├── @supabase/supabase-js                     ← direct client → Postgres over PostgREST
 └── Capacitor iOS wrapper (webDir: "out")
          │
          ▼
 Supabase
 ├── PostgreSQL   ← the authorization and business-logic boundary
 │   ├── RLS on every table
 │   ├── SECURITY INVOKER RPCs: create_reservation, cancel_reservation, get_booking_slots
 │   ├── SECURITY DEFINER: private.booking_slots (schema-isolated from PostgREST)
 │   └── Triggers: availability, publish-completeness, timezone, listing snapshots
 ├── Auth        ← email/password, confirmation required
 ├── Storage     ← one bucket: listing-images
 └── Realtime    ← publication exists; messages table included
```

- Hosting: Netlify, `publish = "out"`, `command = "npm run build"`.
- **No server-side code exists today** — no Edge Functions, no route handlers, no `"use server"`.
  `supabase/functions/` does not exist. *Planned* as the home for payments, webhooks and admin.
- State management is one React context (`StoreProvider`), not a data-fetching library. There is no
  cache layer, no request deduplication, and no optimistic-update framework.

## 4. Account model — *implemented*

One identity per person: `auth.users` ⟷ `public.profiles` (1:1). There is no separate host account.

- `profiles.account_type` (`'guest' | 'host' | 'both'`, default `'guest'`) is a **UX capability flag
  only**. It is referenced by **zero** RLS policies. It must never become an authorization boundary.
- Authorization is purely relational: you are a host of a listing iff `listings.host_id = auth.uid()`.
- The client **never writes `account_type`**. `applySession` omits the column entirely, relying on
  PostgREST's `ON CONFLICT DO UPDATE` touching only keys present in the payload, so a login cannot
  silently promote an account. `account-type-rollback.sql` fails loudly if this regresses.
- The flag flips to `'both'` when a host creates their first listing, and never downgrades. A
  one-shot backfill (`20260923120000`) demoted historical rows that were wrongly marked.
- Hosting vs. traveling **mode** is remembered per user in `localStorage` and restored on explicit
  login only, from safe entry points (`/`, `/host`) — never hijacking a deep link or a recovery screen.
- No co-host role. *Deferred.*

## 5. Authorization model — *implemented*

Resource-ownership only, enforced by RLS plus deliberately narrowed grants. Notable patterns:

- `reservations` grants are narrowed to `select, insert` plus `update (status)` — a column-level
  grant, so no other column can be mutated even by a policy mistake.
- `create_reservation` and `cancel_reservation` are `SECURITY INVOKER` and revoked from
  `public, anon` — they carry no privilege of their own; RLS still applies inside them.
- The one `SECURITY DEFINER` function, `private.booking_slots`, lives in the `private` schema
  (PostgREST does not expose it) and returns only `(start_hour, end_hour)` integer pairs — never
  booking IDs or guest identities.
- **`cancel_reservation` lost its explicit ownership predicate** in `20260908191909`. It is correct
  today only because the function is `SECURITY INVOKER` and `reservations_parties_cancel` filters the
  row. This is load-bearing and fragile; documented here rather than left implicit.

## 6. Data model — *implemented*

Seven tables on `dev`. All have RLS enabled.

| Table | Purpose | Notable constraints |
|---|---|---|
| `profiles` | 1:1 extension of `auth.users` | `full_name` 1–100 chars; `phone_number` E.164 regex; `date_of_birth` bounded 1900-01-01…today; row guaranteed by an `AFTER INSERT` trigger on `auth.users` |
| `listing_addresses` | Private exact street address, 1:1 with a listing | Readable only by the listing's host or a guest holding a **confirmed** reservation on it. `anon` has **zero grant** — not merely an RLS filter |
| `listings` | A rentable outdoor space | `status` draft/published/paused; `listings_published_complete` requires image + coordinates + ≥20-char description to publish; `weekly_hours` jsonb (7-element, Sunday-first, `null` = closed); `blocked_dates date[]` (≤730) |
| `reservations` | A booking | `status` CHECK (see §9); `EXCLUDE USING gist` overlap constraint; ≤14-hour duration; price + listing + timezone snapshots |
| `saved_listings` | Wishlist | PK `(user_id, listing_key)` |
| `conversations` | Thread per (listing, guest, host) | `reservation_id` **nullable** — supports pre-booking inquiry |
| `messages` | Message in a thread | body 1–2000 chars |

**`anon` can read published listings only.** No private data is reachable unauthenticated.

**Dead column:** `listings.day_price` exists and is constrained but is referenced by no pricing path.
Either wire it up or drop it (§24, medium).

## 7. Listing lifecycle — *implemented (core); moderation deferred*

`draft ⇄ published ⇄ paused`, plus `draft`/`paused → archived → draft`. Archiving is reversible and
re-enters the normal publish flow the same way `paused → draft` already did; offered from
`draft`/`paused` only, consistent with the existing pause-before-draft rule. No RLS change was
needed for the new value — `listings_anon_read_published` and `listings_authenticated_read` both use
an exact-match `status = 'published'` predicate, so `archived` is automatically invisible to guests
and other hosts, a claim the test suite verifies rather than assumes.

Publishing is enforced by a **database trigger**, not client validation — a direct PostgREST call
cannot publish an incomplete listing. The client's pre-publish check now mirrors the database
constraint's five conditions exactly (images, lat/long, street address, description ≥20 chars,
neighborhood), returning the specific failing reason instead of a generic fallback. Every status has
real behavior, so there are no dead listing states.

That five-condition check is now a single exported function, `getListingPublishIssue`
(`src/lib/store.tsx`), used both by the actual publish attempt and by the listings list to decide
"Edit" vs. "Finish setup" and to show the specific missing field inline on the card. A UX audit
(§31) found the list previously used its own, looser, two-condition copy (images + coordinates
only), so a listing missing only its street address or description showed "Edit" — implying it was
publish-ready when it wasn't.

A capacity reduction that would leave an existing `pending`/`confirmed`, not-yet-ended reservation
over the new limit is rejected by the same trigger that validates availability — direction-aware, so
raising capacity or lowering it safely is unaffected.

*Deferred:* moderation states (`pending_review`, `rejected`, `suspended`) until §17 exists. No
listing-deletion path exists or is planned — `reservations.listing_id` is `ON DELETE RESTRICT`, and
archiving covers the real product need without the sharp edges of true deletion.

## 8. Availability model — *implemented*

Weekly hours per weekday (whole hours, 08:00–22:00 bounds, must be ≥ `min_hours` span) plus
`blocked_dates`. All evaluated **in the listing's own timezone**, validated against
`pg_timezone_names`.

Two triggers, both taking `pg_advisory_xact_lock` on the listing id so schedule edits and booking
inserts cannot interleave:
- `validate_listing_availability()` — shape and bounds on write.
- `enforce_reservation_availability()` — blocks bookings outside the schedule, **including direct
  REST inserts that bypass the RPC** (explicitly tested).

*Planned:* date-specific overrides (open unusual hours on one date), buffer time between bookings,
maximum booking duration beyond the existing 14-hour cap.

## 9. Reservation lifecycle — *implemented*

`reservations.status` is now `text` CHECK `('confirmed','completed','cancelled')`, default
`'confirmed'`. `pending` is gone — it was never written by any code path, so narrowing the constraint
was a zero-risk cleanup, not a behavior change. `expired` was never actually in the schema at all; it
only ever existed in this document's prose as a *future* Phase 7 (payment-hold) concept, so there was
nothing to remove for it.

```
confirmed ──(end_at passes; swept)──▶ completed        [terminal]
    │
    └──(either party cancels, while still confirmed)──▶ cancelled        [terminal]
```

**Completion is a lazy sweep, not a scheduler — stated plainly, this is a real timing trade-off.**
There is still no server, cron, or scheduled job anywhere in this project. `private.complete_past_
reservations()` (`SECURITY DEFINER`, mirroring the one other precedent for this pattern,
`private.booking_slots`) flips any `confirmed` reservation with `end_at < now()` to `completed`. It's
called — via the thin `public.complete_past_reservations()` invoker wrapper — from
`loadGuestBookings` and `loadHostData` in `src/lib/store.tsx`, before each reads a user's
reservations, best-effort (a failed sweep never blocks the page). **Consequence:** a reservation
becomes `completed` the next time *anyone* loads guest bookings or host reservations, not the instant
its `end_at` passes. Acceptable for now; would need revisiting (a real scheduled job) if something
ever depends on completion happening promptly rather than eventually.

The coupling hazard flagged in an earlier draft of this document is resolved, not just theoretically
safe: the overlap constraint, `cancel_reservation`'s eligibility filter, and `private.booking_slots`'
busy filter all now read `status = 'confirmed'` (simplified from `IN ('pending','confirmed')`, since
`pending` never occurred). A `completed` reservation's `end_at` is necessarily in the past, so it was
never at risk of wrongly blocking a future query regardless — but the constraint itself is now
provably testable, not just reasoned about:
`supabase/tests/reservation-completion-rollback.sql` mutation-tests both the sweep and the
cancellation-eligibility narrowing (breaking each was confirmed to fail the suite, not just assumed
to).

## 10. Cancellation policy — *partially implemented*

Either party may cancel a `confirmed` reservation, via `cancel_reservation`. Cancelled rows drop out
of the overlap constraint, immediately freeing the slot. **New, deliberate consequence of §9:** a
`completed` reservation can no longer be cancelled at all — `cancel_reservation`'s eligibility filter
is now `status = 'confirmed'` exactly, so attempting to cancel one raises the same `P0002` error as
cancelling an already-cancelled one. This is a correctness fix (cancelling something that objectively
already happened doesn't mean anything), not the cutoff-window policy below.

**There is still no time-based cutoff for *future* bookings.** A reservation can be cancelled at any
point up until it's actually over — including the instant before it starts, or while it's in
progress. With no payments there is no refund consequence, so this is currently harmless — but it
becomes a money question the instant Phase 7 lands. *Planned:* an explicit policy (cutoff window,
guest vs. host asymmetry, refund tiers) implemented in the database, not in React.

The guest-facing Cancel booking button (`src/components/Bookings.tsx`) now requires an inline
confirm step before calling `cancelBooking`, matching the confirmation the host side already had
(`src/app/host/reservations/page.tsx`). A UX audit (§31) found the guest side previously cancelled
immediately on click — a single mis-tap cancelled a real reservation with no way back.

## 11. Pricing architecture — *implemented*

**The browser never sends money.** `create_reservation(p_listing_id, p_booking_date, p_start_time,
p_end_time, p_guests)` takes no price parameters and computes from the listing row it reads itself:

```
subtotal    = round(hourly_price × duration_hours, 2)
guest_fee   = round(subtotal × 0.12, 2)
total       = subtotal + guest_fee
host_payout = subtotal                    -- the 12% fee is guest-side only
```

Defence in depth: because the function is `SECURITY INVOKER`, the RLS insert policy independently
re-derives all four values and rejects mismatches, so even a raw PostgREST insert cannot forge a
price. Cent-accuracy is asserted in `marketplace-rollback.sql`.

All four values are snapshotted onto the reservation, alongside `listing_title`, `listing_location`,
`listing_image` and `listing_timezone`, so historical bookings survive listing edits and price
changes.

**Gaps:** no currency column (USD is implicit — a code comment in `src/lib/types.ts:22`, never a
value); no tax model; no discounts; the 12% rate is a hardcoded literal in two places (the function
and the RLS policy) — a single source of truth is needed before it ever changes.

## 12. Payment architecture — *planned, blocked by dependency*

Nothing exists. `src/app/host/dashboard/page.tsx:35` explicitly labels earnings
*"Not collected payments or payouts."*

Target flow — the browser is never the authority:

```
guest → Edge Function creates checkout → payment provider
      → provider webhook → Edge Function verifies signature (service_role)
      → payment row written → reservation transitions → notification
```

Requirements carried forward: idempotency keyed on the provider's event ID; stored provider event
records so a replayed webhook is harmless; separate `payments` / `payment_events` / `refunds`
domains rather than a `payment_status` column.

> **🚩 Phase 7 gate — unresolved.** Stripe Connect availability is determined by the **platform's**
> country of incorporation, not the users'. A US/USD Connect platform generally requires a US
> entity. **Where the operating entity is incorporated must be answered before any payment work
> begins.** If a US entity is not available, the options are a different provider or a
> merchant-of-record — each with real marketplace-payout limitations. This does not block Phases 1–6.

## 13. Payout architecture — *deferred*

Modelled separately from payments (payment → platform fee → provider fee → host earnings → payout).
Not designed until the provider is chosen. `host_payout` is already snapshotted per reservation, so
the data to compute earnings exists.

## 14. Messaging — *implemented*

Decoupled from booking: `conversations.reservation_id` is nullable, so a guest can inquire before
ever booking. One thread per (listing, guest, host).

A real security bug was fixed in `20260913004407`: the insert policy's unqualified `host_id`
resolved to the *inner* table in a subquery, letting a guest forge an arbitrary counterparty. The
policy now qualifies `conversations.` explicitly and the forgery attempt is a regression test.

Realtime publication exists and includes `messages`. *Planned:* unread counts, read state,
reporting, blocking, moderation.

## 15. Notifications — *planned*

None exist. No email, SMS or push is sent for any event — including booking confirmation. Requires a
verified sender domain and a provider, and belongs in an Edge Function.

Target: domain events (`reservation.confirmed`, `reservation.cancelled`, `message.created`, …)
emitted once, with channels subscribing — so adding a channel never means editing business logic.

## 16. Reviews and ratings — *blocked by dependency*

No review table, no way to leave one, no computed aggregate. `rating`, `reviews` and `topHost` exist
**only as hardcoded demo-data flavor** in `src/lib/demo-spaces.ts` and must not reach production as
real-looking data.

No longer blocked on §9 — `completed` reservations are real now. Still blocked on the reviews feature
itself not existing at all: no table, no eligibility check, no UI.

## 17. Trust and safety — *deferred*

Nothing exists: no reports, moderation, suspensions, disputes or verification.

**This is a launch blocker for the real-money path, not merely a feature.** Yardly puts strangers
into private property — and specifically into **pools**. Injury and drowning liability on a platform
that facilitated the booking is a legal and insurance question before it is an engineering one
(§24, critical).

## 18. Admin — *planned*

No admin concept of any kind exists: no `user_roles` table, no `is_admin` column, no custom JWT
claims, no `service_role` usage, no hardcoded email check. Because every policy is ownership-based,
**an administrator today can see nobody's reservations, messages or draft listings.**

Target: a `user_roles` table checked by policy, with privileged operations behind an Edge Function
holding `service_role`. Not blocked by the static-export decision.

## 19. Search — *partially implemented; scaling gap*

`refreshMarketplace` (`src/lib/store.tsx:96`) issues exactly one query —
`select … where status = 'published' order by created_at desc` — with **no limit and no
pagination**. Every published listing is pulled into the browser, and *all* filtering (location,
category, price, capacity, date availability, map bounds) happens in React
(`src/components/Explore.tsx:46-70`).

Correct and safe today — unpublished listings are excluded server-side, so nothing private leaks —
but it does not scale past a few hundred listings, and it directly contradicts the principle of not
filtering in React what Postgres can filter. *Planned:* server-side filtering, pagination, and
indexes, before listing volume grows.

**Demo-mode fallback:** if the query returns zero published listings, the app substitutes
`DEMO_SPACES` for *any* visitor. Demo listings cannot be booked — their IDs are not valid UUIDs and
`DemoCheckout.tsx` writes only to browser storage.

## 20. Maps and geolocation — *partially implemented*

CARTO `light_all` basemap when `NEXT_PUBLIC_CARTO_BASEMAP_KEY` is set, falling back to raw
OpenStreetMap tiles. Geocoding via `photon.komoot.io` with **no country restriction** — worth
constraining now that the market is US (§2).

No PostGIS. Coordinates are plain columns with a range check. Adequate while filtering is
client-side; revisit alongside §19.

## 21. Deployment architecture — *implemented*

Netlify static hosting from `out/`. `output: "export"`, `trailingSlash: true`,
`images: { unoptimized: true }`.

Per §2 this stays. Consequences to design around: no per-request rendering, no route handlers,
images unoptimized, and any listing page must be generated at build time.

## 22. SEO — *not implemented* 🚩

**There are currently zero indexable listings.** `spaceHref()` (`src/lib/spaces.ts:16`) emits
`/spaces?id=<uuid>`; there is no `/spaces/[id]`. Every listing shares one client-rendered URL.

Present: root `metadata` in `src/app/layout.tsx` (title, description, `metadataBase`, an `openGraph`
block **with no image**) and page metadata on `/trust`.

Absent: `generateMetadata` anywhere, `sitemap.ts`, `robots.ts`, canonical URLs, OG/Twitter images,
structured data, `not-found.tsx`.

*Planned (and compatible with static export):* convert to `/spaces/[id]` with
`generateStaticParams`, add per-listing `generateMetadata`, sitemap, robots, canonical and OG
images. Listings then refresh on rebuild — acceptable at current volume. `PROJECT_SCOPE.md` already
lists canonical metadata and social preview artwork as unmet launch requirements.

## 23. Security architecture — *partially implemented*

Strong where it has been worked: RLS on every table, narrowed grants, column-level update grant on
reservations, schema-isolated `SECURITY DEFINER`, seven rollback suites plus a genuine concurrency test.

**Storage** — two buckets, `listing-images` and `avatars`: both `public: true`, same MIME allowlist
(JPEG/PNG/WebP/HEIC/HEIF), write/update/delete confined to a top-level folder named for the
uploader's uid. `listing-images` allows 10 MiB (a gallery); `avatars` 5 MiB (one photo). Both
policy shapes are now tested against real roles in `avatar-storage-rollback.sql` — the first test in
the repo to exercise storage RLS at all; writing it surfaced that `ci-bootstrap.sql` never granted
`anon`/`authenticated` table-level CRUD on `storage.objects`, which the real platform grants outside
any project migration. Fixed alongside it. Remaining gaps: `profiles.avatar_url` has a bucket now
but still no client code reads or writes it (§25); deleting a listing orphans its images, which stay
publicly readable forever; `listings.images` is an unvalidated `text[]` that could point anywhere.

**Error handling (§32 of the brief) — implemented.** `src/lib/errors.ts` classifies every error by
sqlstate into `validation` / `authorization` / `not_found` / `conflict` / `availability` /
`rate_limit` / `network` / `unknown`, and uses the database's own message only when it does not
match an engine-output shape (`violates`, `permission denied`, quoted relation/constraint/column
names) — otherwise substituting safe wording for that class. The database's ~21 authored messages
(`create_reservation` raising *"That time is no longer available."*, etc.) survive unchanged; raw
constraint and RLS-policy text never reaches a user. The withheld detail isn't lost — it's logged
with a context label outside production. Covered by 18 cases in `tests/errors.spec.ts`, including
mutation-style assertions that specific engine strings are suppressed.

**No rate limiting** anywhere beyond a 60-second client-side throttle on resending confirmation
email — which is trivially bypassed. Server-side limits need Edge Functions.

## 24. Observability — *not implemented*

No structured logging, no error monitoring, no business-event tracking. Nothing would surface a
failed booking, an authorization failure, or a silent trigger error. Required before real money
moves.

## 25. Known gaps

Ranked by severity. Critical items are launch blockers for the real-money path.

### Critical

| Gap | Note |
|---|---|
| **No legal entity / ToS / liability / insurance posture** | Strangers in private backyards and pools. Injury and drowning liability is a legal and insurance question before an engineering one. Blocks launch, not merely a phase |
| **Stripe platform jurisdiction unresolved** | See §12. Determines whether the US/USD payment path is buildable at all |
| **No data-protection policy** | DOB, phone numbers and exact home addresses are stored, with no retention, deletion or export path |
| **No marketplace tax model** | Tied to jurisdiction; a compliance decision, not a code decision |

### High

| Gap | Note |
|---|---|
| Zero indexable listings (§22) | Primary acquisition channel for a marketplace is unavailable |
| No admin or moderation capability (§18) | Nobody can intervene in any dispute, report or bad listing |
| No notifications (§15) | Guests and hosts receive no booking confirmation of any kind |
| No observability (§24) | Failures are invisible |

### Medium

| Gap | Note |
|---|---|
| Search loads all listings into the browser (§19) | Correct but unscalable |
| `avatar_url` has a bucket but no upload path (§23) | Infrastructure landed; no UI or store wiring yet |
| Orphaned listing images (§23) | Not reachable through the app today — no listing-delete UI exists, and archiving deletes nothing. Only a direct DB delete on a listing with zero reservations could trigger it |
| `listings.day_price` is dead (§6, §7) | Still untouched — wire up or drop is a pricing/business decision, not resolved by the host/listing domain pass |
| 12% fee hardcoded in two places (§11) | Needs one source of truth |
| No server-side rate limiting (§23) | Needs Edge Functions |

### Low

| Gap | Note |
|---|---|
| `cancel_reservation` ownership predicate removed (§5) | Correct today, load-bearing on RLS + INVOKER |
| Inconsistent locale usage | `en-US` in some formatters, browser default in others |
| Geocoding unrestricted by country (§20) | Market is now US |
| No `maxLength` on the signup name field | DB enforces 1–100; long input fails server-side with a raw error |

### Unverified

Real email delivery, live redirect-URL allowlisting, expired-link handling, and a full
password-change-then-login round trip have **never been tested against the real Supabase project
with a real inbox** — only via mocked Playwright tests and code review. The iOS deep-link auth
callback (`com.acefayad.yardly://auth/callback`) is likewise unverified on device.

### Recently landed

| PR | Adds |
|---|---|
| **#21** | `listing_addresses`: exact street address, readable only by the host or a guest with a *confirmed* reservation; `anon` has zero grant. Adds `private-address-rollback.sql`. **Enforces invariant 6** |
| **#25** | Stops the client writing `account_type` (§4); adds persistent hosting/traveling mode; backfill migration; `account-type-rollback.sql` *(supersedes #22, which GitHub auto-closed when its base branch was deleted on merge of #21)* |
| **#23** | `AFTER INSERT` trigger on `auth.users` guaranteeing a `profiles` row survives an interrupted signup; `profile-provisioning-rollback.sql` |
| **#26** | `booking-concurrency.sh` — invariant 7 under genuine concurrent sessions, not a serial transaction; also fixes CI's `push` trigger to include `dev` |
| **#27** | `src/lib/errors.ts` — error taxonomy; `String(error.message)` no longer reaches users |
| **#28** | `avatars` storage bucket + policies, mirroring `listing-images`; `avatar-storage-rollback.sql`; fixed a missing grant in `ci-bootstrap.sql` that the new test exposed |

> An earlier draft of this document described #21/#25/#23 as implemented while they were still
> unmerged — the defect that prompted this rewrite. All six PRs above are now genuinely on `dev`,
> verified at the time by replaying all 15 migrations and all 6 rollback suites against a clean
> local Postgres.

Since then, two more PRs landed for the master brief's Phase 2 (host/listing domain, §7): **#29**
(archived status, the capacity-vs-reservation guard, `listing-lifecycle-rollback.sql`) and **#30**
(photo management, per-field publish validation, the guest-facing preview — client-only, no
migration). Then a third round implemented this roadmap's own Phase 2 (§9, §10): `pending` dropped,
`completed` wired up via a lazy sweep, `reservation-completion-rollback.sql`. Current counts: 17
migrations, 8 rollback suites plus the concurrency test.

## 26. System invariants

The properties that must hold regardless of how the UI changes. "Tested" means a
`supabase/tests/*.sql` suite asserts it.

| # | Invariant | Enforced by | Status |
|---|---|---|---|
| 1 | A user cannot book their own listing | `create_reservation` self-book check | ✅ Implemented, tested |
| 2 | A non-owner cannot modify another user's listing | `listings` RLS | ✅ Implemented, tested |
| 3 | A guest cannot access another guest's reservation | `reservations` RLS | ✅ Implemented, tested |
| 4 | A host cannot access unrelated reservations | RLS via listing ownership | ✅ Implemented, tested |
| 5 | Unpublished listings cannot receive bookings | `create_reservation` + RLS | ✅ Implemented, tested |
| 6 | Exact addresses are never publicly exposed | `listing_addresses` grants (no `anon` grant at all) | ✅ Implemented, tested |
| 7 | Overlapping reservations cannot both be valid | `reservations_no_active_overlap` EXCLUDE gist | ✅ Implemented, tested — including under genuine concurrency |
| 8 | Client-provided totals are never trusted | RPC takes no price args + RLS re-derives | ✅ Implemented, tested |
| 9 | Payment success is determined by verified processing | — | ⛔ Planned (§12) |
| 10 | Duplicate payment events are idempotent | — | ⛔ Planned (§12) |
| 11 | Historical reservation prices remain stable | Snapshot columns + snapshot trigger | ✅ Implemented |
| 12 | Review eligibility requires a completed reservation | Would be `reservations.status = 'completed'` | ⛔ The mechanism exists (§9); still blocked by §16 (no reviews feature at all) |
| 13 | Admin access is separately authorized | — | ⛔ No admin exists (§18) |
| 14 | Privileged functions are not callable by unintended roles | `revoke … from public, anon`; `private` schema | ✅ Implemented, partially tested |
| 15 | RLS is tested, not assumed | 2 rollback suites | ✅ Holds for current tables |
| 16 | Grants *and* RLS are both reviewed | `revoke all` + explicit grant pattern | ✅ Holds |
| 17 | Critical state transitions are authoritative outside the browser | RPCs + triggers + RLS | ✅ Implemented |

**Invariant 7 no longer carries that caveat.** `booking-concurrency.sh` opens two real connections
and interleaves them — one holds an uncommitted booking while the other attempts an overlapping one,
which must block and then fail once the first commits. Mutation-tested: dropping the constraint
makes both sessions succeed, confirming the test can actually observe the failure it guards against.

## 27. Testing architecture — *partially implemented*

Three deliberately complementary layers. None substitutes for the others.

**Database tests** (`supabase/tests/*.sql`) — `begin; … rollback;` suites run against an isolated
Postgres in CI, exercising real RLS as different roles. These are the actual proof that access
control works.
- `marketplace-rollback.sql` — self-booking, draft visibility, cross-user edits, cent-accurate
  pricing, timezone snapshots, overlap rejection, capacity, past/overnight bookings, wishlists,
  conversations, message authorization, cancellation.
- `availability-rollback.sql` — schedule validation, slot computation, blocked dates, direct-REST
  bypass rejection, slot release on cancel.
- `private-address-rollback.sql` — address read/write scopes, the publish guard, and revocation on
  cancellation.
- `account-type-rollback.sql` — proves `account_type` grants and removes no access, and that the
  backfill demotes only non-hosts.
- `profile-provisioning-rollback.sql` — signup-trigger fallback name chain, 100-char truncation,
  idempotency, and that `profiles_insert_own` is unchanged.
- `avatar-storage-rollback.sql` — storage RLS as different roles: public read, owner-scoped
  write/update/delete, outsider denied. The first test in the repo to exercise storage policies at
  all; also exists for `listing-images`, untested since the first migration.
- `listing-lifecycle-rollback.sql` — archive/restore transitions, archived-listing invisibility to
  anon and to a different authenticated user, and the capacity-vs-reservation guard (rejects an
  unsafe reduction, allows a safe one or any increase, allows the reduction once the conflicting
  reservation is cancelled).
- `reservation-completion-rollback.sql` — the sweep completes a past confirmed reservation, leaves a
  future one and a cancelled one untouched, and a completed reservation can no longer be cancelled;
  the sweep's grant is confirmed narrow (`anon` denied); re-running the sweep is a no-op.
- `ci-bootstrap.sql` — not a test; a stub of the Supabase surface so migrations can replay on bare
  Postgres.

**Concurrency test** (`supabase/tests/booking-concurrency.sh`) — a category of its own: two real,
simultaneous `psql` sessions, not a serial `begin…rollback`. Commits its own fixtures (both sessions
must see them) and removes them via an `EXIT` trap. Runs last in CI so it never interleaves with the
rollback suites. Proves invariant 7 (§26).

**Playwright** (`tests/*.spec.ts`) — mocks Supabase's REST/auth endpoints entirely. Proves UI
behavior given a backend response; proves **nothing** about backend security. `tests/errors.spec.ts`
is the one exception worth naming: it unit-tests `src/lib/errors.ts` directly rather than mocking a
backend. `host-listing-archive.spec.ts` and `host-listing-photos.spec.ts` cover the archive/restore
flow and the full photo add/delete/reorder/upload-progress path respectively — the latter caught its
own flake during development (an assertion racing an un-awaited click against a fixed timer) before
landing, verified stable over 20 repeated runs afterward.

> **Standing gotcha:** `scripts/serve-test-build.mjs` serves a prebuilt `out/` directory. Always run
> `npm run build` before `npm run test:e2e`, or tests silently exercise stale code.

Gaps: no failure-path coverage for most flows; no test for orphaned listing images after deletion.

## 28. Route map

| Route | Sign-in | Surface |
|---|---|---|
| `/` | No | Guest — browse/search |
| `/spaces?id=` | No | Guest — listing detail *(query-param; see §22)* |
| `/bookings` | Yes | Guest — bookings, cancellation |
| `/trips` | Soft | Guest — confirmed trips + map |
| `/wishlists` | Soft | Guest — saved listings |
| `/messages` | Yes | Both — inbox/thread |
| `/profile` | Soft | Both — account summary, edit |
| `/reset-password` | No | Both — request/complete reset |
| `/trust` | No | Policies / how-it-works |
| `/host` | No | Host — landing, CTA |
| `/host/dashboard` | Yes | Host — metrics, upcoming reservations |
| `/host/listings` | Yes | Host — list + publish/pause |
| `/host/listings/new` · `/edit?id=` · `/availability?id=` | Yes | Host — create / edit / schedule |
| `/host/reservations` | Yes | Host — reservations, filter, cancel |

One root `layout.tsx` wraps everything in `StoreProvider` + `Header` + `AuthModal` + `BottomNav`. No
nested layouts. Mobile uses a bottom nav that swaps between guest and host item sets.

## 29. Dependency graph

```
Foundation (auth · RLS · grants · storage · errors · CI)
   ├─▶ Listings ──▶ Availability ──▶ Reservations ──▶ Pricing ──▶ Payments ──▶ Payouts
   │                                      │                          │
   │                                      └──▶ completed ──▶ Reviews │
   │                                                                  │
   ├─▶ Search / SEO            (independent — can proceed in parallel)│
   ├─▶ Messaging ──▶ Notifications ◀────── domain events ─────────────┘
   └─▶ Admin (user_roles + Edge Function) ──▶ Trust & Safety
```

Hard rules: no Payments before Reservations **and** Pricing are settled. No Payouts before Payments.
No Reviews before `completed` exists. No Notifications before domain events. Admin is **not** gated
on the deployment decision.

## 30. Roadmap

Reflecting §2. Per the brief's §45: stop and verify at each phase boundary.

**Also complete, outside this numbered sequence:** the master brief's own "Phase 2 — host/listing
domain" (archived status, the capacity-vs-reservation guard, real per-field pre-publish validation,
photo delete/reorder/upload-progress, a guest-facing preview — see §7). This roadmap reprioritized
away from the brief's phase numbers back in Phase 0, since an audit found most of the listing domain
already built; what remained didn't correspond to a numbered slot below, so it's recorded here rather
than forcing a renumber of Phases 2–13 and their several cross-references (§12's Phase 7 gate, etc.).

| Phase | Work | Gate |
|---|---|---|
| **0** | *This document* | ✅ Complete |
| **1** | ~~Merge #21→#25→#23. Error taxonomy. Avatar bucket. Fix CI `push` trigger to `dev`. Concurrency test for invariant 7~~ ✅ Complete (#21, #25, #23, #26, #27, #28) | Invariants 1–8 all enforced and tested |
| **2** | ~~Reservation lifecycle: implement `completed`; drop `pending`; handle the §9 coupling hazard~~ ✅ Complete | No dead states; past bookings display correctly |
| **3** | Cancellation policy — cutoff window, guest/host asymmetry, DB-enforced | One authoritative policy, no React duplication |
| **4** | SEO: `/spaces/[id]` + `generateStaticParams` + `generateMetadata` + sitemap/robots/canonical/OG | Listings indexable |
| **5** | Pricing hardening: currency column, single-source fee rate, tax model shape | Currency explicit before price rows accumulate |
| **6** | Search: server-side filtering, pagination, indexes | Browser no longer loads the full table |
| **7** | **Payments** — *blocked on the §12 jurisdiction question* | No client manipulation can mark a reservation paid; duplicate webhooks harmless |
| **8** | Notifications + domain events | Booking confirmations actually send |
| **9** | Reviews | Eligibility requires a real completed reservation |
| **10** | Admin foundations (`user_roles` + Edge Function) | Admin authorization separately tested |
| **11** | Trust & safety | Reports, moderation, suspension |
| **12** | Payouts | After the payment model is known |
| **13** | Production hardening + security review gate | Per §50/§51 of the brief |

**Running in parallel, not sequenced:** the four critical legal/compliance items in §25. They are
not engineering phases and should not wait for one.

## 31. UX audit findings — *partially addressed*

A full workflow audit (routing/back-button behavior, the guest booking flow, the host and
account-management flow) against a "does this feel like Airbnb" bar, 2026-09-24. 26 findings total;
the ones that risked a destructive action, showed something misleading, or silently lost a host's
work were fixed immediately (cited inline at §7, §9, §10, and below). The rest are recorded here,
ranked, rather than built without being asked for or silently dropped.

**Fixed this pass:**
- Guest cancellation required no confirmation (§10) — now matches the host side's confirm step.
- The listings list's publish-readiness label used a looser, duplicated check than the real
  five-condition gate (§7) — now a single shared function, with the specific missing field shown
  inline on the card.
- The host dashboard's earnings metric read like real money ("Estimated booking value" with the
  disclaimer in the smallest, mutedest text) — relabeled with an inline "estimated" tag and a
  visually-promoted disclaimer, matching the treatment already used on `/host/reservations`.
- The booking submit button showed "Checking availability…" while actually creating the
  reservation (reusing the slot-loading state's copy) — now "Confirming your reservation…".
- Browser/device Back did not close the auth modal or the mobile search sheet — the page underneath
  navigated away while the modal stayed visually open (a real risk of exiting the Capacitor iOS
  wrapper via the native back gesture). Both now integrate with the History API
  (`src/lib/useBackToClose.ts`) so the first Back tap closes them instead.
- The host listing wizard could silently discard everything typed — including selected photos — to
  one browser Back tap or an accidental tab close, since it kept state only in memory. It now
  confirms before discarding (`src/lib/useConfirmLeave.ts`) and guards `beforeunload` while dirty.
- Publish/Pause/Move-to-draft gave no in-flight feedback; because `setHostListingStatus` updates
  optimistically, a per-button "Saving…" relabel briefly showed on more than one button at once as
  the status flip changed which buttons render mid-request. Fixed with one shared "Saving…"
  indicator at the card level instead of relabeling whichever button happens to be visible.

**Not built this pass — backlog, ranked:**
- No photo lightbox/gallery on the listing detail page — a listing with more than 5 photos has no
  way to view the rest.
- No broken-image fallback anywhere (`<img>`/`<Image>` with no `onError`) — a missing/expired image
  URL shows the browser's broken-image icon across cards, detail, trips, and bookings.
- A signed-out guest interrupted mid-booking by the auth modal isn't returned to their in-flight
  reservation attempt after logging in — they must click Reserve again (form state is preserved, so
  this is friction, not data loss).
- No `not-found.tsx` — a dead/mistyped route falls through to Next's generic, unbranded 404, losing
  the app's chrome entirely.
- No route-level `loading.tsx`/`error.tsx` on any of the 14 routes — some pages hand-roll their own
  `Suspense` fallback, inconsistently, and nothing catches an unexpected render throw.
- `profiles.avatar_url` has a storage bucket (§23) but still no upload UI or client code reading it.
- No way to change account email from `/profile` (password change works in-place; email is
  read-only).
- The availability editor has no "apply to all days" bulk action and blocks dates one at a time via
  a text input rather than a calendar range-select.
- Canceled trips show only a count behind a `<details>` disclosure, with no per-booking detail.
- The hosting/traveling mode badge and switch button are hidden below their responsive breakpoints
  on narrow mobile viewports — the hamburger account menu is the only way to see or change mode.
- Mobile listing cards can't swipe between photos — the prev/next arrows are desktop-only
  (`sm:` and up), with no touch-swipe substitute.
- The auth modal has no field-level inline validation — errors surface only after submit, in one
  shared feedback region, relying on native browser validation before that.
- The Header account-menu dropdown has no focus trap, unlike the auth modal's.
- When real and demo listings mix in the same grid (once at least one real listing exists), the
  per-card "Demo listing" pill is the only distinguishing mark — easy to skim past.
- A few more minor items: the "Resend confirmation email" link is shown even in Log In mode before
  any signup attempt; the Restore/Publish/Pause action set has no confirmation for Pause
  specifically (Archive is the only one gated); logout has no visual danger styling or confirmation.

---

*Update this document whenever the architecture changes. Never label something implemented because
its UI exists.*
