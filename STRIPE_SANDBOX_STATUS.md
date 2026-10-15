# Stripe sandbox integration — not production-ready

This branch is isolated to Supabase project `vfwbtfkmzxaehbsbrojx` and Stripe test keys. Do not merge or apply its payment migration to production until the release gates below are verified.

## Implemented

- Server-priced Checkout with a configurable 12% guest fee, stored per booking.
- Signed webhook handling, temporary availability holds, payment confirmation and pre-start full-refund requests.
- Host Connect onboarding and delayed host transfers, gated on reservation end, available funds, account readiness and charge checks.
- Authenticated server endpoints, database-enforced overlap checks, and blocked direct client reservation writes in the sandbox.
- Sandbox-only guest and host payment UI; production payment UI remains disabled.

## Evidence so far

- October 15: native payment transport now uses CapacitorHttp with an explicit, allowlisted HTTPS `NEXT_PUBLIC_PAYMENTS_API_ORIGIN`, bearer authentication, matching server origin, bounded timeouts and redirects disabled. Web requests remain same-origin. Missing native configuration fails closed. No environment values, native bundle ID, live gates or server authorization were changed. Stripe browser return/deep-link handling and a real simulator/device checkout remain unfinished; this is transport groundwork, not native payment sign-off.
- Local clean-checkout validation: all 31 tests (25 server + 6 transport), lint, production build, quality audit and production dependency audit pass. CI includes both test files. Transport tests use stub HTTP responses, not a running iOS bridge. Prior server tests also passed CI; this new commit's deployment/CI must be rechecked.
- Rollback-only database regression tests pass in the sandbox (`supabase/tests/stripe-sandbox-payments.sql`).
- Lint, static production build, quality checks and production dependency audit passed locally.
- Sandbox Supabase security advisor returned no findings.
- GitHub database CI now passes both the legacy contract and payment contract tests in order, using the Supabase service role in the isolated test harness.
- Branch-specific Netlify settings and webhook are configured. Corrected database credentials are deployed and authenticated endpoints work. The full public key was verified.
- Synthetic host Connect onboarding completed; the deployed endpoint reports ready for sandbox payouts.
- Real sandbox Checkout order `64652565-8f1f-410d-9ea4-159cd771784e` charged $22.40 ($20 host subtotal plus $2.40 guest fee). The signed webhook confirmed the reservation. Cancellation produced refund `re_3UQZYIKrePGT859w0iYnVVGW`; repeated cancellation kept the same refund and no transfer.
- Checkout exposed missing service-role permissions on existing listings/reservations. The follow-up migration grants only the backend operations required. A new service-role database regression passes; client grants are unchanged.
- Second sandbox order `065f610d-15bb-4198-b7a9-2a5fefd9a721` exposed an early-transfer defect. Although the database stayed paid with no transfer ID, Stripe confirms a $20 transfer `tr_3UQZZnKrePGT859w2ykDIKZw` at 21:19:30 UTC, during the before-end test. The earlier database-only conclusion that no transfer occurred was incorrect. Its reservation was subsequently moved to an ended time for testing. No real funds were involved.
- The release worker now requires the exact order ID and releasing state from the database claim, rather than a truthiness check that can accept a null-field composite object. Existing transfers without a releasing ledger are blocked for review instead of silently ignoring the mismatch. Two new regressions failed before this fix and pass afterward. Fresh deployed before/after-end tests are still required; this is not a verified payout release yet.
- Live Stripe account inspection on October 14 found business information, public details, statement descriptor and account representative incomplete. Email verification and product activation were not started. The owner has been asked to complete these with real details. Live release is authorized by the user but remains gated on account activation and payment safety tests.

## Required release gates

### October 14 deployed payout re-test

- Commit `aac68c6d` passed GitHub web/database/iOS checks and deployed to preview #42.
- Fresh synthetic order `73e8d26b-51e6-41ad-aa8e-c130b2d87270` paid $22.40 using Stripe test card ending 0077; webhook moved the order to paid.
- Reconciliation before its October 18 reservation end produced no Stripe transfers (verified directly with the Stripe transfer-group lookup, not only the database).
- Moved only this synthetic sandbox reservation to October 14 17:00–19:00 UTC to simulate completion. Reconciliation created exactly one $20 transfer `tr_3UQZtZKrePGT859w1Ei3aK8M`, matching the database transferred state and transfer ID. Another worker invocation left exactly one transfer in Stripe.
- The older early-transfer fixture `065f610d-15bb-4198-b7a9-2a5fefd9a721` is now blocked for review. Its earlier test transfer has not been reversed. Fresh transfer testing verifies release to the connected Stripe balance, not a completed bank payout.
- Replayed actual sandbox Checkout event `evt_1UQZtbKrePGT859wJMFsS3UW` to endpoint `we_1UQZ28KrePGT859w9rCQngY1` after the successful transfer. Stripe's pending webhook count returned from 1 to 0; the ledger retained the same transferred state and transfer ID, with the same reservation. Replay did not roll the payment state backward.
- Expired real sandbox Checkout session `cs_test_b1neY4mE5jW8dOOokmZFnREHvoC0Qzx8PYSaf7U5AZeLwMhjlLiX0QNvy1` for synthetic order `0f5c2a35-4e55-44fc-8fb9-8f0cf3bae808`. Stripe returned expired/unpaid; the signed webhook left the ledger expired, reservation cancelled, and charge/transfer IDs null. The availability RPC returned the October 19 10:00–12:00 slot again. No payment was attempted.
- Sent Tim and Joel the live-account and owner-decision checklist in their existing Messages group on October 14. This notification does not establish that the owner tasks are complete.
- Replayed completed-checkout event `evt_1UQZYJKrePGT859w5IIkuMUr` for already-refunded order `64652565-8f1f-410d-9ea4-159cd771784e`. Stripe pending webhooks returned to zero. The ledger remained refunded with the same refund ID, no transfer, and a cancelled reservation. All 17 server regression tests passed again.
- Deployed declined-card test passed for synthetic order `4677bfcb-aca6-4d8c-a966-e6faf2c54567`, session `cs_test_b1RiA7M7oWupb7jFhQUuHpmoxT7Y24mTVtm8lJXticXlDH4mflHqSesFty` (October 20, 10:00–12:00). Stripe's official generic-decline test card produced an explicit decline in Checkout. Yardly remained pending, with no recorded charge or transfer. After explicitly expiring the unpaid sandbox session, the webhook set the ledger expired and reservation cancelled; the availability RPC returned the slot again. Link saving was disabled; no real card or funds were used.
- Remaining tests include concurrent/recovery paths and post-transfer dispute/refund recovery. Live activation remains incomplete; no production merge or live charge was performed.
- Concurrent identical checkout requests verified on preview #42 at commit `387d01b1`: both deployed POST requests returned HTTP 200 with the same order `e729cb36-0fbe-496e-aa5e-87f2dab58058` and the same Stripe test Checkout session. The database contains exactly one order/reservation for request `a6000000-0000-4000-8000-000000000025`. A separate request (`...0026`) for the same October 21 10:00–12:00 slot returned HTTP 409 and created no order. No card was submitted; the synthetic hold remains pending with null charge/transfer IDs. Natural expiry and hold cleanup still need verification on a later run. This tests duplicate-request idempotency and an existing hold, not simultaneous competing guests or post-transfer recovery.
- Sandbox fixture cleanup on October 14: retrieved the old early transfer `tr_3UQZZnKrePGT859w2ykDIKZw` and verified `livemode: false`, USD 20, the expected synthetic host and order, and no existing reversal. A single manual Stripe reversal returned `trr_1UQbqzKrePGT859wc9z51ZsS` for the full USD 20. This supersedes the earlier unreversed-fixture note; it is manual test cleanup, not proof of automated post-transfer recovery or a guest refund. No ledger mutation was performed. Commit `d19f20cf` passed web/database/iOS checks and Netlify deployment. Local source and Git-object reads stalled for roughly two minutes before completing; no source changes were made.

### Remaining gates

### October 14 native release audit

- Existing bundle ID is `com.acefayad.yardly` in both Capacitor configuration and Xcode. Local project version is 1.0/build 8; this is not a verification of the latest uploaded App Store Connect build. Xcode 26.6 is installed.
- Native payment transport is not implemented: `src/lib/payments.ts` fetches relative `/.netlify/functions/` URLs, while the app bundles `out` locally without a remote server URL. These routes do not resolve to Netlify in the packaged app.
- The backend requires the web origin and has no native-origin/preflight handling. Merely replacing the relative URL with an HTTPS URL will not complete native integration.
- Checkout success/cancellation currently return to the web bookings page. The native `appUrlOpen` listener handles authentication codes only, not payment return links. Implement and device-test an authenticated native checkout/return flow before uploading a payments-enabled review build; do not broaden CORS indiscriminately or embed server secrets.

### Outstanding release work

- October 15 local testing unblocked without modifying the original workspace or its iCloud settings: clean shallow checkout of `eeb91908` at `/private/tmp/yardly-release-check.OUUjgl`, installed locked dependencies with `npm ci --ignore-scripts`. All 25 server regressions, lint, static production build, quality audit (after build), and production-only dependency audit passed locally. Full installation still reports 12 development-inclusive advisories; production audit reports zero. The initial quality command ran before the parallel build completed and correctly reported missing `out`; rerunning after build passed. This temporary checkout contains no production secrets and uses dummy public Supabase build settings. It can be reused for upcoming development; keep it until needed work is complete. CI web/database/iOS and sandbox deployment for `eeb91908` also passed. No native payment flow or live release is claimed by these checks.

- Partial-transfer reversal guard implemented October 15: `releaseOrder` now blocks a prior transfer with any nonzero `amount_reversed`, even when `reversed` is false. Added a regression asserting one block transition and no replacement transfer. A focused execution of the actual helper (Node type stripping with unused external imports removed to bypass offloaded dependencies) failed before the fix (`transferred` instead of `block`) and passed after it. This is mocked helper coverage, not a deployed Stripe reversal test. Full local suite remains waiting on dependency hydration; CI/deploy results must be checked after push. Automated post-transfer recovery is still outstanding.

- October 15 transfer-retry review found an additional guard needed in `releaseOrder`: Stripe's `reversed` flag is false for a partial reversal (official Transfer object reference: https://docs.stripe.com/api/transfers/object). The existing-transfer path must also reject a nonzero `amount_reversed` before recording `transferred`, with a regression covering `reversed:false, amount_reversed:1`. This is a source-review finding, not yet a reproduced or fixed regression. Full PR diff reviewed remotely; local Git-object reads, the test file and required installed framework guide remain blocked/offloaded. No payment code or live configuration changed during this check.

- October 15 00:13 UTC: natural expiry completed for concurrent-retry fixture `e729cb36-0fbe-496e-aa5e-87f2dab58058` without manually expiring it or invoking reconciliation. The order is expired, its reservation cancelled, and charge/transfer IDs remain null. `get_booking_slots` again includes October 21 10:00–12:00 for the synthetic listing. This closes the pending expiry/hold-cleanup check above. Commit `216d5938` passed web/database/iOS checks and Netlify deployment; live release remains disabled.

- October 15 00:03 UTC: deployed webhook verification rejected both an unsigned and a forged-signature `checkout.session.completed` payload with HTTP 400 / `Invalid signature`. Both targeted only the existing synthetic pending fixture; before/after database reads showed pending order/reservation and null charge/transfer IDs. No Stripe charge was attempted. Natural expiry of that checkout is still pending; do not submit another checkout for it. Commit `9b2ed76c` passed web/database/iOS checks and Netlify deploy `6ad0161033e2901f4c378ff8`.

- October 14 database access verification used rollback-only `authenticated` role/JWT simulations in the sandbox: the synthetic guest and host each see checkout fixture `e729cb36-0fbe-496e-aa5e-87f2dab58058`; an unrelated subject sees zero payment orders. Privilege inspection confirms no authenticated INSERT/UPDATE/DELETE and no anonymous SELECT on `payment_orders`. No data or policy was changed. This verifies ledger RLS/grants, not the complete authenticated browser flow or all other tables. Commit `f977dece` passed web/database/iOS checks and Netlify deploy `6ad01426847a97571c4c24a5`; local dependencies still show macOS dataless flags.

- Commit `184ccc07` passed GitHub web/database/iOS checks and Netlify deploy `6acffec1cb13b8316cc906a2`. Deployed API checks: repeated cancellation returned 200 and status remained refunded; unauthenticated status access returned no booking data; wrong-origin cancellation was rejected; retrying the expired checkout returned the original expired order with no checkout URL and exactly one ledger record. This does not exercise the new partial-refund guard on Stripe; that dedicated integration test remains outstanding.
- Cancellation response correction verified on deploy `6ad00a5d1565b778db49c8ab` (commit `107772ce`): repeating cancellation of the refunded fixture returned HTTP 200 with `state: refunded`; the independent payment-status endpoint agreed. All 24 server tests, web checks, database checks and iOS validation passed in GitHub CI. Production dependency audit reported zero vulnerabilities; the full install reported development dependency advisories, which are not covered by that production-only audit. Local dependencies remain offloaded by macOS; the owner was already asked to keep the workspace downloaded. No production merge or live activation occurred.

- Refund reconciliation defect fixed locally: a succeeded refund with matching metadata but only a partial amount could previously mark the entire booking refunded. A regression failed before the fix. Refund results now require the exact amount, USD currency, PaymentIntent, charge and booking metadata; mismatches block for review without another refund. Added pending/failed and expanded-reference cases. All 21 tests, lint, production build, quality checks and production dependency audit passed. Deployed verification of this new guard is still required.

- Configure branch-specific Netlify public database settings, backend database settings, exact app origin and signed webhook secret. Never commit credentials.
- Deploy and run real sandbox Checkout success/failure, replayed webhooks, refunds and host onboarding tests.
- Verify delayed transfers after reservation completion, retry/concurrency behavior and post-transfer dispute/refund recovery.
- Review all access policies with authenticated guest/host fixtures and verify mobile/desktop UI.
- Reconcile migration history: the sandbox inherited its base schema; September 23/24 prerequisite migrations and the payment migration were executed iteratively, not registered by the migration runner.
- Netlify does not schedule functions on Deploy Previews. Invoke reconciliation manually during sandbox QA; verify production scheduling before launch.
- Confirm owner-approved cancellation policy, Stripe processing-fee economics and live Connect activation before a separate live release.

The temporary Supabase branch is billable while it exists. Remove it after testing when its data is no longer needed; do not remove it during active QA.
