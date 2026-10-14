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
- Branch-specific Netlify settings and webhook are configured. A truncated sandbox database secret was identified during authenticated testing and corrected; redeploy and retry are required before declaring the connection verified.

## Required release gates

- Configure branch-specific Netlify public database settings, backend database settings, exact app origin and signed webhook secret. Never commit credentials.
- Deploy and run real sandbox Checkout success/failure, replayed webhooks, refunds and host onboarding tests.
- Verify delayed transfers after reservation completion, retry/concurrency behavior and post-transfer dispute/refund recovery.
- Review all access policies with authenticated guest/host fixtures and verify mobile/desktop UI.
- Reconcile migration history: the sandbox inherited its base schema; September 23/24 prerequisite migrations and the payment migration were executed iteratively, not registered by the migration runner.
- Netlify does not schedule functions on Deploy Previews. Invoke reconciliation manually during sandbox QA; verify production scheduling before launch.
- Confirm owner-approved cancellation policy, Stripe processing-fee economics and live Connect activation before a separate live release.

The temporary Supabase branch is billable while it exists. Remove it after testing when its data is no longer needed; do not remove it during active QA.
