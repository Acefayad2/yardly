# Yardly readiness — 2026-09-13

## Verified in this pass

- Reproduced and fixed the conversation-insert RLS bug: an unrelated host was accepted because correlated columns were not qualified. Both host identity and reservation/listing/guest association are now checked.
- Ran `supabase/tests/marketplace-rollback.sql` against Yardly. It verifies host listing ownership, draft privacy, server-calculated prices, local timezones, self-booking rejection, overlapping booking rejection, capacity, past/overnight rejection, cancellation, slot reuse, adjacent bookings, wishlist persistence/privacy, and private guest/host messages.
- The fixture transaction rolls back. Follow-up inspection found zero leftover QA listings and zero existing conversations with mismatched hosts/reservations.
- GitHub CI now replays migrations into isolated PostgreSQL 17 and runs the database suite. This complements, not replaces, Supabase Auth/Storage integration testing.
- Twelve desktop/mobile browser tests cover booking math, search/calendar/guests, signup contact requirements, failed login feedback, protected host routes, recovery-request UI, profile-update payloads and oversized photo rejection. API responses are mocked in these browser tests; they do not prove email delivery or real storage uploads.
- Real test-account login and profile/session restoration were checked on the deployed preview.
- Fixed whole-dollar service-fee rounding, invalid default start times for long minimum bookings, guest-local versus listing-local date boundaries, and conflicting wishlist import upserts.
- Added password recovery and profile editing. Added photo type/size/count validation before uploads.
- Fixed desktop search collapsing while users interact with a scrollable date panel.
- Production build, lint, quality audit and production dependency audit pass locally. Production dependency audit: zero vulnerabilities.
- Synced configured web assets into Capacitor and built for the simulator. Bundle ID remains `com.acefayad.yardly`.

## Host availability release — 2026-09-13

- Hosts now manage weekly opening hours, closed weekdays and whole blocked dates from Listings → Availability. Hours are in the listing timezone, within the existing 08:00–22:00 single-day booking policy.
- Guests load bookable start/duration pairs from the database; occupied, closed, blocked and past slots are excluded. Loading and failed requests disable Reserve, with a retry path. A conflict at submission refreshes the slots.
- Server triggers enforce host availability even for direct inserts. Existing reservations remain intact after schedule changes. A private function filters other guests’ reservations without exposing their identities or booking rows.
- Availability migration and rollback suite passed against isolated PostgreSQL 17 and the live Yardly database. Tests cover ownership, invalid schedules, anonymous/draft privacy, blocked days, closed weekdays, direct writes, overlaps, cancellation and unchanged existing reservations.
- Desktop/mobile UI tests cover host save/reload/unblock, load failures, guest slot selection, unavailable dates, request failures, and stale-slot submission recovery. These browser tests use mocked APIs; they complement the real database regression tests, not a full live upload/email walkthrough.

## Still required — do not describe these as complete

- Verify recovery email delivery, callback allowlisting, expired-link handling and an actual password-change/login round trip with a dedicated test inbox. No existing account password was changed.
- Verify real photo upload and a complete host/guest UI booking flow using isolated test accounts/inventory. Database policy tests are not a substitute for this walkthrough.
- Add notifications, agreed cancellation-policy enforcement and payment/payout/refund integration once the client decisions/setup are supplied. The current reservation RPC does not collect payment.
- Review private address exposure: precise listing coordinates are currently readable with published listings. The business must approve an approximate public location/exact-address-after-booking policy before launch.
- Supabase advisor reports leaked-password protection disabled; confirm plan support and enable before launch. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Resolve the simulator launch failure before beta upload, then validate on a physical device and confirm the latest App Store Connect build number. No new TestFlight build was uploaded in this pass.

Client coordination checklist was sent to Joel in #proj-yardly: payments/payouts, domain/DNS, email/support, policies, inventory, account ownership and service access.
