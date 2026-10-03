# Booking and conversation visibility verification

## Scope

This change uses existing reservation snapshots and participant-only conversations. It does not change database migrations, RLS, grants, profile access, or production data. The application must never substitute a different inbox thread when a requested conversation is missing.

## Automated checks

- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run quality`, and `npm audit --omit=dev --audit-level=high`
- `npm run test:e2e` includes desktop and mobile fixtures for paused/archived trip visibility, more than three trips, saved booking detail links, existing guest/host contact, published-listing guest initiation, permission failures, missing-thread explanations, exact-recipient deep links, Back navigation, and separate drafts
- CI runs `supabase/tests/booking-visibility-rollback.sql` in its isolated PostgreSQL 17 service after all versioned migrations. Random transaction-local fixtures prove the nullable listing join preserves authorized threads, hosts/guests retain booking/message access, and outsiders/private profiles remain restricted
- These browser fixtures test UI behavior; PostgreSQL tests exercise actual RLS. Neither substitutes for a Supabase staging Auth/PostgREST smoke test

## Production-parity staging test

Use an approved disposable Supabase project with production's applied migration set. Do not point fixture scripts or the app's test sign-in at production. Do not apply the four pending production migrations as part of this UI release.

1. Create synthetic host, guest, and unrelated-user accounts. Publish a synthetic listing with a private address and make a future confirmed booking
2. Guest starts a conversation while the listing is published. Exchange synthetic replies through the UI
3. Host pauses the listing. Verify the guest's Trips and booking detail show the saved title/date/price and authorized address; the marketplace omits the listing. The trip opens the booking, not an unavailable listing page
4. Confirm the conversation REST request embeds `listings(title,images,status)` without `!inner`; it returns the thread with a null listing. Both participants can reply, the inbox displays the unavailable-listing explanation, and View space is absent
5. Verify host reservation contact opens the thread for that exact listing/guest. Use multiple synthetic guests for the same listing to detect incorrect matching
6. Verify a guest can initiate a new thread for a published listing; a host without a thread and a guest on an unavailable listing receive the explanation without an attempted insert
7. Sign in as the unrelated user. Verify bookings, addresses, threads, messages, and other profiles cannot be read. Switch inbox links and use Back/Forward; ensure drafts stay with their intended recipient and missing links cannot send to a fallback thread
8. Verify cancellation and sign-out remove the corresponding visible trip/address. Reload at mobile and desktop widths
9. Repeat with archived status only in the isolated full-migration environment. Production does not yet support archived status; introducing it requires the separately approved migration rollout

## Separate decisions

New host-initiated conversations, new guest conversations after a listing is paused, and cross-party phone/email/profile details need a reviewed access model and explicit approval. They are not enabled by this change. Listing archive, signup/profile provisioning, avatar storage, and reservation-completion migrations remain outside this release.
