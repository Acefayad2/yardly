# Stripe sandbox integration — not production-ready

This branch is isolated to Supabase project `vfwbtfkmzxaehbsbrojx` and Stripe test keys. Do not merge or apply its payment migration to production until the release gates below are verified.

## Implemented

- Server-priced Checkout with a configurable 12% guest fee, stored per booking.
- Signed webhook handling, temporary availability holds, payment confirmation and pre-start full-refund requests.
- Host Connect onboarding and delayed host transfers, gated on reservation end, available funds, account readiness and charge checks.
- Authenticated server endpoints, database-enforced overlap checks, and blocked direct client reservation writes in the sandbox.
- Sandbox-only guest and host payment UI; production payment UI remains disabled.

## Evidence so far

- 17 mocked server regression tests pass (`node --test tests/payment-server.test.mjs`). These are not real Stripe transaction tests.
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
- Remaining tests include failed-card handling, concurrent/recovery paths and post-transfer dispute/refund recovery. Live activation remains incomplete; no production merge or live charge was performed.

### Remaining gates

- Configure branch-specific Netlify public database settings, backend database settings, exact app origin and signed webhook secret. Never commit credentials.
- Deploy and run real sandbox Checkout success/failure, replayed webhooks, refunds and host onboarding tests.
- Verify delayed transfers after reservation completion, retry/concurrency behavior and post-transfer dispute/refund recovery.
- Review all access policies with authenticated guest/host fixtures and verify mobile/desktop UI.
- Reconcile migration history: the sandbox inherited its base schema; September 23/24 prerequisite migrations and the payment migration were executed iteratively, not registered by the migration runner.
- Netlify does not schedule functions on Deploy Previews. Invoke reconciliation manually during sandbox QA; verify production scheduling before launch.
- Confirm owner-approved cancellation policy, Stripe processing-fee economics and live Connect activation before a separate live release.

The temporary Supabase branch is billable while it exists. Remove it after testing when its data is no longer needed; do not remove it during active QA.
