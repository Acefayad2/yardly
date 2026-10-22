# Expansion beta preparation — October 22, 2026

## Scope

Services/photographers, equipment requests and separate quotes, reviewed church
listings, verified community directory, and human-reviewed booking assistance.
Email notifications are explicitly deferred by Ace. Check the in-app workspaces
for updates. No new charges, real providers, church permissions or confirmations
have been fabricated.

This release branch combines main `5950df42` with the previously tested payment
baseline `b82468f0`. This preserves build 9's sandbox-only payment transport and
guards rather than removing them when adding the expansion. Production payment
enablement remains out of scope. Keep the existing bundle `com.acefayad.yardly`
and signing team `TX69NKN54N`.

## Implemented and verified so far

- Six existing expansion migrations applied to sandbox `vfwbtfkmzxaehbsbrojx`.
- All five expansion SQL rollback suites passed against that sandbox.
- Provider uploads use a new private `provider-work-samples` bucket, limited to
  JPEG/PNG/WebP and 5 MB per object. Owners and staff can read draft media; other
  users can read only media referenced by an approved profile belonging to the
  uploader. No client overwrite/delete policy: reviewed media cannot be swapped.
- Storage rollback suite verifies owner access, outsider denial, forged path
  denial, overwrite denial, staff review access, and approved public reads.
- Rendered media uses five-minute signed URLs, renewed while mounted. Previously
  issued URLs remain usable until expiry. Canonical URLs, not tokens, are saved.
  Abandoned uploads remain private; administrative orphan cleanup is not automated.
- AI CORS now includes Supabase SDK headers; unsupported SDK response field removed.
  `deno check` passes with pinned dependency lockfile. AI remains disabled unless
  `NEXT_PUBLIC_ASSISTANCE_AI_ENABLED=true`; enable only after credentials, model
  access and deployed-function tests pass. Manual staff preparation remains usable.
- Next.js and matching ESLint configuration upgraded to 16.4.2. Production dependency
  audit reports zero vulnerabilities. Development-tool advisories still exist.
- Before payment-branch reconciliation: 191 browser tests passed, one intentional
  skip. All 40 payment/transport tests passed after reconciliation.

## Sandbox migration history mapping

Management API recorded apply-time versions rather than source-file versions.
Do not blindly replay the source files against this already-migrated sandbox.

| Source version | Sandbox history version | Migration |
| --- | --- | --- |
| 20261017120000 | 20261022181241 | provider_marketplace_review |
| 20261017155045 | 20261022181243 | provider_request_quote_workflow |
| 20261017160335 | 20261022181244 | church_listing_workflow |
| 20261017160342 | 20261022181301 | community_space_directory |
| 20261017160942 | 20261022181303 | booking_assistance_workflow |
| 20261017162601 | 20261022181305 | harden_expansion_state_transitions |
| 20261022185701 | 20261022185824 | provider_work_samples |

Security advisor still reports 29 authenticated SECURITY DEFINER RPC warnings.
These existing workflow endpoints deliberately require authenticated callers and
enforce participant/staff checks. The rollback suites exercise those boundaries;
this is not a claim that every security concern has been independently audited.
No new SECURITY DEFINER function was introduced for photo storage.

## Remaining release/operational gates

- Tim confirmed as intended staff owner, using `Trh31887@aol.com`. Exact email
  lookup found no account in either beta or production project on October 22.
  Tim must register in beta; then grant the verified account staff access.
  No other user was given staff permissions.
- AI provider account/key and live generation verification are still missing.
- Real providers, rental inventory, three participating churches, permissions,
  approved photos and directory sources still require client onboarding.
- $49 billing remains preview-only pending separate business authorization.
- Production schema/deployment was not changed by these sandbox operations.
- Build 10 native archive, simulator walkthrough and TestFlight distribution
  must be verified separately; build 9 remains the last confirmed tester release
  at the time this note was created.

## Tester walkthrough

1. Explore the labeled example properties (demo build flag only).
2. Open Services, sign in, list a business, upload permitted samples and submit.
3. Verified staff reviews the profile; another account requests a separate quote.
4. Provider quotes; customer accepts the exact terms; provider confirms.
5. Church representative supplies listing details and photo permission for review.
6. Staff enters/verifies a real community source before publishing it.
7. Customer opens Booking help. Staff prepares suggestions manually, then an
   application; customer approves the exact revision before staff records submission.
8. Confirm that no email or new charge is promised and private cases stay private.
