# Host walkthrough — September 22, 2026

This is a partial host-readiness pass, not production launch approval.

## Real browser walkthrough against production

Used the existing signed-in test host. Left the pre-existing `pool` draft unchanged.

1. Uploaded a newly generated PNG labeled `YARDLY QA TEST — NOT FOR RENT` through the listing form. Real Supabase Storage upload and draft insert succeeded.
2. Selected a public landmark address through the real address suggestions/map flow. The form saved the public area and rounded coordinates, not a private street address.
3. Saved title, description, amenity and rules; reopened the draft. Photo count and form fields persisted.
4. Changed the hourly price from $45 to $46 and saved. Listings displayed the updated price.
5. Closed all seven weekdays, added October 23 as a blocked date, saved and reloaded. The saved schedule and blocked date persisted. Native keyboard selection was needed because the browser automation's date-fill operation did not commit React state.
6. Published the clearly labeled QA listing while all weekdays remained closed, verified its real uploaded image/listing page, then paused it and moved it back to draft.

QA draft ID: `2303ef05-38ff-44d9-9a87-e0e6b870c3e8`. Retained as an unpublished test fixture with all weekdays closed. No customer reservations or charges were created.

## Corrections

- Hosts can cancel an upcoming reservation through the existing authorized cancellation RPC, with explicit confirmation, pending state, failure feedback and refreshed results. It explicitly does not promise a refund or an email.
- Added a manual reservation refresh control.
- Changed host financial wording to estimated booking value, not collected payments/payouts; corrected the misleading "Next 30 days" label.
- Removed the unsupported 100% response-rate claim and zero-acre label from real listings.
- Single-photo desktop listings use the full gallery width.
- Owners see a manage-listing link instead of a button to message themselves.
- Editing copy now explains that published-listing edits go live; it no longer calls every edited listing a draft.
- Removed automatic exact-address delivery promises because that feature is not implemented.

## Verification and limits

Added desktop/mobile mocked UI coverage for host cancellation: keep reservation makes no request, rejected cancellation leaves the booking visible, successful cancellation moves it to the cancelled filter, and refresh preserves the result. This does not replace a live two-account walkthrough.

There is only one existing Auth account. The connected Supabase CLI returned HTTP 403 for the Auth administration prerequisite. No permissions were weakened and no users were manufactured through SQL to bypass this restriction. A second guest test login was requested.

Still unverified: real guest booking → host receipt → two-way messaging → cancellation in the UI. Existing database rollback tests cover the underlying permissions and reservation rules, but not delivered emails or real two-person UI use.

Still unfinished: secure private-address storage/delivery, notifications, client-approved cancellation/refund policy enforcement, payment collection and host payouts. No new payment, email, private-address schema, or iOS changes are included in this release.
