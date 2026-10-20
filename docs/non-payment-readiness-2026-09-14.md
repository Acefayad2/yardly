# Non-payment launch pass — September 14, 2026

Payments are explicitly deferred. This is a partial readiness pass, not launch sign-off.

## Implemented

- Flexible search: twelve month cards, Any day / Weekdays / Weekends, one selected month. Searches individual available dates in the listing timezone and carries the matching date into booking. Bookings remain hourly and within one day. Exact-date tolerance remains in Dates mode.
- Confirmation resend with email validation, generic responses and a one-minute client cooldown (server rate limits remain authoritative).
- Expired account-link notice with confirmation and password-recovery paths.
- Enabled leaked-password protection in the existing Yardly Supabase project. Security advisor returned no findings after saving. No plan or billing change.

## Evidence

- Local lint, webpack production build, quality audit and production dependency audit passed.
- Existing 22 browser tests plus four flexible-search cases passed. Two new account-link tests passed after correcting their request matcher. These are mocked UI tests, not proof of delivered email.
- Live-database transaction-only regression suites passed for booking conflicts, capacity, timezone, cancellation, messaging authorization, wishlists, weekly availability and blocked dates. All fixtures rolled back.
- Production has zero published real listings at this check.
- Simulator-target Xcode build succeeded with bundle ID `com.acefayad.yardly` unchanged. Simulator boot waited on Apple's CoreLocation data migration; interactive diagnosis then hit a locked Mac. No physical devices were found. No TestFlight upload was performed.

## Still required

1. Real two-account walkthrough: photo upload → publish → guest booking → messages → cancellation, using approved test inboxes and a clearly marked test listing. No real customer booking was created in this pass.
2. Email delivery: Supabase dashboard confirms the built-in email service is still in use and warns it is not for production. Need the client's verified sender/domain and SMTP configuration, then test delivered confirmation/recovery links, expiration, reset and subsequent login.
3. Private exact-address storage and delivery: current host form rounds public coordinates to two decimals and discards the precise address; there is no private address table yet. Define the disclosure point, implement host/confirmed-guest RLS, and test cancellation revokes access. Client rounding alone is not a database privacy boundary.
4. Booking/message notifications and client-approved cancellation cutoff rules. Existing cancellation RPC is authorized but does not implement a business cancellation window. Do not describe email notifications or policy enforcement as complete.
5. Domain, support email, approved legal/policy copy, real inventory and verified client account ownership. Do not invent client identity or claim policies are approved.
6. Unlock the Mac; finish simulator diagnostics, connect a physical iPhone, test the final build and upload a newly numbered signed TestFlight release.

No payment collection, payouts, refund or failed-payment changes were made.
