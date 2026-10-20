# Guest cancellation pending-state fix

## Change

- Retain the selected booking's confirmation and pending state until cancellation and its refresh finish; the existing loading view appears during refresh
- Block another cancellation in the mounted bookings view with a synchronous in-flight guard and disabled controls across all booking cards
- Restore usable controls after a returned or thrown error; allow dismissal and an intentional retry
- Preserve server cancellation eligibility and the existing confirmation requirement

## Reproduction and verification

An isolated harness executing the real component handlers reproduced requests for booking 1, booking 2, then booking 1 again while the first two promises were pending. A single `cancellingId` was being replaced by the second card. Reopening the first card alone did not duplicate the request: its confirmation was disabled until a different card replaced that ID.

The same synthetic harness passes the synchronous duplicate guard, cross-card disabled controls, returned-error and thrown-error recovery, dismissal, deliberate retry, and a subsequent booking.

Local lint, TypeScript, production build, quality audit, and production dependency audit passed (zero production vulnerabilities). Independent review found no blocking issues.

`tests/guest-cancellation-pending.spec.ts` adds delayed-response browser coverage for success, a server error, and a network interruption at desktop and mobile widths. It mocks auth and reservation requests and never accesses live bookings. The existing immediate-success and confirmation test remains in place.

Local browser execution is blocked by the maintenance environment's Chromium socket restriction. Browser and isolated-database checks must pass in the standard GitHub Actions workflow before merge. This is a mounted-view guard; it does not claim to coordinate separate tabs, reloads, or remounts.

No database migration, permission, payment, or booking-policy change is included.
