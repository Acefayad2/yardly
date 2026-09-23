# Yardly — System Design

Living architecture document. Describes **the `dev` branch exactly as it stands**, not an aspirational
merged state. Last audited 2026-09-23 against the 14 migrations, 5 SQL test suites, and the `src/`
tree actually present on `dev`.

The three previously-stacked pull requests (#21 → #25 → #23) have now merged, so private address
disclosure, persistent host mode and signup profile provisioning are all live on `dev` and are
labelled accordingly below. See §25.

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

## 7. Listing lifecycle — *partially implemented*

`draft → published ⇄ paused`. No `archived`, no moderation states.

Publishing is enforced by a **database trigger**, not client validation — a direct PostgREST call
cannot publish an incomplete listing. Every status has real behavior (draft and paused are invisible
to guests and unbookable), so there are no dead listing states.

*Planned:* `archived` (so hosts can retire a listing without losing its reservation history).
*Deferred:* moderation states (`pending_review`, `rejected`, `suspended`) until §17 exists.

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

## 9. Reservation lifecycle — *partially implemented; target agreed*

**Today the column is `text` CHECK `('pending','confirmed','completed','cancelled')` with default
`'pending'` — but only two states are reachable.** `create_reservation` inserts the literal
`'confirmed'`, and the insert RLS policy hard-requires `status = 'confirmed'`. Nothing anywhere
writes `pending` or `completed`. The default is dead. No scheduler, cron or `pg_cron` exists.

Consequence in the UI: `src/lib/store.tsx:694` buckets anything not `cancelled`/`completed` as
`"upcoming"`, so a booking from six months ago still displays as upcoming.

**Target state (per §2):**

```
confirmed ──(end_at passes)──▶ completed
    │
    └──(either party cancels)──▶ cancelled        [terminal]
```

`pending` and `expired` are **removed** via a deliberate migration, and re-added in Phase 7 when a
payment hold gives them meaning.

> **Coupling hazard — must be handled by any completion mechanism.** The overlap constraint's
> predicate is `WHERE status IN ('pending','confirmed')`, and both `cancel_reservation`'s eligibility
> filter and `private.booking_slots`' busy filter use the same set. The moment a row becomes
> `completed` it drops out of all three. Harmless for past times, but it means `status` is currently
> doing double duty as *"is this slot live."* Completion must only ever apply to already-past
> reservations, and that needs a test.

## 10. Cancellation policy — *partially implemented*

Either party may cancel a `confirmed` reservation, via `cancel_reservation`. Cancelled rows drop out
of the overlap constraint, immediately freeing the slot.

**There is no time-based cutoff of any kind.** A reservation can be cancelled after it was supposed
to start, or after it ended. With no payments there is no refund consequence, so this is currently
harmless — but it becomes a money question the instant Phase 7 lands. *Planned:* an explicit policy
(cutoff window, guest vs. host asymmetry, refund tiers) implemented in the database, not in React.

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

Blocked on §9: review eligibility requires a `completed` reservation, which is currently unreachable.

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
reservations, schema-isolated `SECURITY DEFINER`, two substantial rollback test suites.

**Storage** — one bucket, `listing-images`: `public: true`, 10 MiB limit, MIME allowlist
(JPEG/PNG/WebP/HEIC/HEIF). Write/update/delete are confined to a top-level folder named for the
uploader's uid. Gaps: no avatar bucket exists at all (`profiles.avatar_url` is an unbacked text
column); deleting a listing orphans its images, which stay publicly readable forever; `listings.images`
is an unvalidated `text[]` that could point anywhere.

**Error handling (§32 of the brief) — not implemented.** `errorMessage()`
(`src/lib/store.tsx:779`) returns `String(error.message)` verbatim, so raw Postgres and PostgREST
errors reach users. Some are deliberately friendly (`create_reservation` raises *"That time is no
longer available."*), but constraint violations surface as raw SQL text. There is no error taxonomy
distinguishing validation / authorization / not-found / conflict / transient.

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
| **No data-protection policy** | DOB, phone numbers and (via PR #21) exact home addresses are stored, with no retention, deletion or export path |
| **No marketplace tax model** | Tied to jurisdiction; a compliance decision, not a code decision |

### High

| Gap | Note |
|---|---|
| Zero indexable listings (§22) | Primary acquisition channel for a marketplace is unavailable |
| No admin or moderation capability (§18) | Nobody can intervene in any dispute, report or bad listing |
| `completed` unreachable (§9) | Blocks reviews; makes every past booking display as "upcoming" |
| No notifications (§15) | Guests and hosts receive no booking confirmation of any kind |
| No observability (§24) | Failures are invisible |

### Medium

| Gap | Note |
|---|---|
| Search loads all listings into the browser (§19) | Correct but unscalable |
| No avatar storage bucket (§23) | `avatar_url` is an unbacked column |
| Orphaned listing images (§23) | Publicly readable indefinitely after listing deletion |
| Raw DB errors shown to users (§23) | No error taxonomy |
| `listings.day_price` is dead (§6) | Wire up or drop |
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

> An earlier draft of this document described all three as implemented while they were still
> unmerged — the defect that prompted this rewrite. They are now genuinely on `dev`, verified by
> replaying all 14 migrations and all 5 rollback suites against a clean local Postgres.

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
| 7 | Overlapping reservations cannot both be valid | `reservations_no_active_overlap` EXCLUDE gist | ✅ Implemented, tested — but serially, never concurrently |
| 8 | Client-provided totals are never trusted | RPC takes no price args + RLS re-derives | ✅ Implemented, tested |
| 9 | Payment success is determined by verified processing | — | ⛔ Planned (§12) |
| 10 | Duplicate payment events are idempotent | — | ⛔ Planned (§12) |
| 11 | Historical reservation prices remain stable | Snapshot columns + snapshot trigger | ✅ Implemented |
| 12 | Review eligibility requires a completed reservation | — | ⛔ Blocked by §9 and §16 |
| 13 | Admin access is separately authorized | — | ⛔ No admin exists (§18) |
| 14 | Privileged functions are not callable by unintended roles | `revoke … from public, anon`; `private` schema | ✅ Implemented, partially tested |
| 15 | RLS is tested, not assumed | 2 rollback suites | ✅ Holds for current tables |
| 16 | Grants *and* RLS are both reviewed | `revoke all` + explicit grant pattern | ✅ Holds |
| 17 | Critical state transitions are authoritative outside the browser | RPCs + triggers + RLS | ✅ Implemented |

**Invariant 7 carries a caveat worth repeating:** the constraint is index-enforced at commit and is
genuinely concurrency-safe, but both existing tests run serially inside one transaction. They prove
the constraint rejects overlaps; they do not exercise two simultaneous sessions. A true concurrency
test is *planned*.

## 27. Testing architecture — *partially implemented*

Two deliberately complementary layers. Neither substitutes for the other.

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
- `ci-bootstrap.sql` — not a test; a stub of the Supabase surface so migrations can replay on bare
  Postgres.

**Playwright** (`tests/*.spec.ts`) — mocks Supabase's REST/auth endpoints entirely. Proves UI
behavior given a backend response; proves **nothing** about backend security.

> **Standing gotcha:** `scripts/serve-test-build.mjs` serves a prebuilt `out/` directory. Always run
> `npm run build` before `npm run test:e2e`, or tests silently exercise stale code.

Gaps: no concurrency test (invariant 7); no storage-security test; no failure-path coverage for most
flows; CI's `push` trigger is still `branches: [main]` while `dev` is the real integration branch.

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

| Phase | Work | Gate |
|---|---|---|
| **0** | *This document* | ✅ Complete |
| **1** | ~~Merge #21→#25→#23~~ ✅. Error taxonomy. Avatar bucket. Fix CI `push` trigger to `dev`. Concurrency test for invariant 7 | Invariants 1–8 all enforced and tested |
| **2** | Reservation lifecycle: implement `completed`; migration dropping `pending`/`expired`; handle the §9 coupling hazard | No dead states; past bookings display correctly |
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

---

*Update this document whenever the architecture changes. Never label something implemented because
its UI exists.*
