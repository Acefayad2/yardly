# Expansion reconciliation — 2026-10-20

Two independent implementations of the Yardly Expansion Proposal (Chesapeake
Project Management Solutions, 2026-10-10) existed at the same time. This note
records what they were, which one survived, and what has to happen to any
database that already ran the superseded migration.

## What existed

**`codex/yardly-expansion-reviewed-20261017` (kept).** All five proposed
features, in migrations dated 2026-10-17:

- `provider_profiles`, `provider_inventory_items`, `provider_profile_reviews`,
  `marketplace_staff` — provider listings with a staff review state machine and
  an audit trail of each decision.
- `provider_requests`, `provider_quotes`, `provider_request_items`,
  `provider_request_messages` — the request/quote pipeline, including per-request
  messaging and quote revisions.
- `church_listings`, `church_event_requests`, `church_listing_reviews`,
  `church_photo_permissions` — church spaces, including the photo-permission
  record the proposal requires before publication.
- `community_spaces`, `community_space_sources`, `community_space_checks` — the
  directory, with source freshness and a recorded last-checked date.
- `booking_assistance_cases`, `booking_assistance_applications`,
  `booking_assistance_suggestions`, `booking_assistance_fee_previews` — the
  assistance workflow and the $49 fee state, including the no-fee and refund
  outcomes.

It also carries Playwright specs, per-feature SQL rollback tests, a CI workflow
(`.github/workflows/expansion-database.yml`), and `supabase/tests/expansion-concurrency.sh`,
which proves the row-lock races with `pg_blocking_pids` — a stale quote
acceptance, a closure racing a submission, an expiry racing a confirmation, and
a directory edit racing a source review all fail closed.

**`20261020101500_expansion_providers_quotes_directory.sql` (removed).** A
narrower foundation written against a checkout that was 40+ commits behind
`origin/main`, so it was built without knowing the branch existed. It covered
providers, the quote pipeline and the directory only — no church workflow, no
booking assistance, no tests — using different table names (`providers`,
`quote_requests`, `quotes`, `directory_spaces`, `staff`).

## Decision

The branch was adopted and the 2026-10-20 implementation deleted. It was a
strict subset: fewer features, no messaging, no review audit trail, no tests,
and no concurrency proof. Keeping both would have left two parallel provider
tables modelling the same thing.

Because the two used different table names, nothing collided in the schema. The
only real conflict was the `/services` route, resolved in the branch's favour.

Removed with the migration: `src/lib/providers.ts`,
`src/components/{ServicesDirectory,ProviderDetail,QuoteStatusBadge}.tsx`,
`src/app/{quotes,host/quotes,host/provider}/page.tsx`, and the provider and
quote types appended to `src/lib/types.ts`. The account menu and host nav links
added for those routes now point at `/services/requests`.

## If a database already ran the removed migration

The removed migration was never applied to the production project, but any
database that did run it still holds its objects, and nothing in the kept
migrations drops them. Drop them by hand there — in this order, because of the
foreign keys:

```sql
drop function if exists public.set_quote_request_status(uuid, text);
drop function if exists public.submit_quote(uuid, numeric, numeric, text, text, timestamptz);
drop function if exists public.is_staff();
drop table if exists public.quotes;
drop table if exists public.quote_request_items;
drop table if exists public.quote_requests;
drop table if exists public.rental_items;
drop table if exists public.provider_services;
drop table if exists public.providers;
drop table if exists public.directory_spaces;
drop table if exists public.staff;
```

Check `supabase_migrations.schema_migrations` for a `20261020101500` row and
delete it too, or the CLI will believe a migration that no longer exists in the
repository has been applied.

## Checked and already covered

An earlier draft of this note claimed the kept schema was missing a
publish-completeness constraint and provider contact format checks. Both claims
were wrong, and reading the kept migration settles it:

- Completeness is enforced in `submit_provider_profile`, and more thoroughly
  than a table constraint would be: a summary of at least 40 characters, at
  least one non-empty offering, at least one HTTPS sample URL, and for
  equipment providers also inventory rows plus delivery, setup and pickup
  details.
- There are no contact email or phone columns to format-check, by design.
  Planners reach a provider through `provider_request_messages` rather than
  through contact details published on the profile.

Neither path can be bypassed. `review_state` appears in no column-level grant,
so no client can write it directly; the only transitions are
`submit_provider_profile` (draft or rejected to pending) and
`review_provider_profile` (pending to approved or rejected, staff only). An
incomplete profile cannot reach `pending`, and only a `pending` profile can be
approved.

No follow-up migration is needed.

## Still out of scope

The AI booking assistant and the $49 fee collection both need server-side code.
`next.config.ts` sets `output: "export"`, so this app ships as static files with
no server runtime and no route handlers. The assistance workflow's database side
exists on the kept branch; actually calling a model, and taking a payment, needs
Supabase Edge Functions (and a payment processor — there is still no Stripe
dependency in `package.json`).
