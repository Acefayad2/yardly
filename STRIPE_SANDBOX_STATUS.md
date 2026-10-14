# Stripe sandbox integration — not production-ready

This branch is isolated to Supabase project `vfwbtfkmzxaehbsbrojx` and Stripe test keys. Do not merge or apply its payment migration to production until the release gates below are verified.

## Implemented

- Server-priced Checkout with a configurable 12% guest fee, stored per booking.
- Signed webhook handling, temporary availability holds, payment confirmation and pre-start full-refund requests.
- Host Connect onboarding and delayed host transfers, gated on reservation end, available funds, account readiness and charge checks.
- Authenticated server endpoints, database-enforced overlap checks, and blocked direct client reservation writes in the sandbox.
- Sandbox-only guest and host payment UI; production payment UI remains disabled.

## Evidence so far

- 15 mocked server regression tests pass (`node --test tests/payment-server.test.mjs`). These are not real Stripe transaction tests.
- Rollback-only database regression tests pass in the sandbox (`supabase/tests/stripe-sandbox-payments.sql`).
- Lint, static production build, quality checks and production dependency audit passed locally.
- Sandbox Supabase security advisor returned no findings.
- GitHub database CI now passes both the legacy contract and payment contract tests in order, using the Supabase service role in the isolated test harness.
- Branch-specific Netlify settings and webhook are configured. Corrected database credentials are deployed and authenticated endpoints work. The full public key was verified.
- Synthetic host Connect onboarding completed; the deployed endpoint reports ready for sandbox payouts.
- Real sandbox Checkout order `64652565-8f1f-410d-9ea4-159cd771784e` charged $22.40 ($20 host subtotal plus $2.40 guest fee). The signed webhook confirmed the reservation. Cancellation produced refund `re_3UQZYIKrePGT859w0iYnVVGW`; repeated cancellation kept the same refund and no transfer.
- Checkout exposed missing service-role permissions on existing listings/reservations. The follow-up migration grants only the backend operations required. A new service-role database regression passes; client grants are unchanged.
- Second sandbox order `065f610d-15bb-4198-b7a9-2a5fefd9a721` paid successfully. Manual reconciliation before its end left it paid with no transfer. Its synthetic reservation was then moved to an ended time for testing; reconciliation still withheld transfer without an error. Settlement/account readiness needs diagnosis before claiming payout completion.

## Required release gates

- Configure branch-specific Netlify public database settings, backend database settings, exact app origin and signed webhook secret. Never commit credentials.
- Deploy and run real sandbox Checkout success/failure, replayed webhooks, refunds and host onboarding tests.
- Verify delayed transfers after reservation completion, retry/concurrency behavior and post-transfer dispute/refund recovery.
- Review all access policies with authenticated guest/host fixtures and verify mobile/desktop UI.
- Reconcile migration history: the sandbox inherited its base schema; September 23/24 prerequisite migrations and the payment migration were executed iteratively, not registered by the migration runner.
- Netlify does not schedule functions on Deploy Previews. Invoke reconciliation manually during sandbox QA; verify production scheduling before launch.
- Confirm owner-approved cancellation policy, Stripe processing-fee economics and live Connect activation before a separate live release.

The temporary Supabase branch is billable while it exists. Remove it after testing when its data is no longer needed; do not remove it during active QA.
