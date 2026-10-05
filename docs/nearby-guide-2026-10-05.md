# Nearby guide and iOS build 8 — October 5, 2026

## Delivered feature

- Hosts manage up to six recommendations beneath the listing edit wizard. Each recommendation saves independently and includes a category, public venue address and optional tip.
- Confirmed/completed guests see the guide on booking details, including for paused/archived listings. Cancelled bookings and unrelated users cannot read the guide; only the listing owner can write it.
- Directions use only the host-entered public venue address. No property coordinates or private address are added to those links.
- No sample recommendations are inserted. Hosts need to enter genuine local favorites.

## Verification

- Latest main at implementation start: `a9db123a`, including developer booking/message visibility fixes and dependency security patches.
- Lint, production build (Next.js 16.3.8), quality audit and production dependency audit pass.
- All 28 booking/guide browser checks pass against the deployed QA build on desktop and mobile. New tests cover saved guide editing/removal, persistence across reload, save/load failure recovery, guest directions and empty states, using mocked test accounts/data.
- GitHub isolated Postgres migration replay and permission tests pass. The recommendations migration is applied to the Yardly backend; RLS and grants verified; security advisor reports no findings.
- Signed iOS archive version 1.0 (8) succeeds. Bundle ID `com.acefayad.yardly` and team `TX69NKN54N` are unchanged. Capacitor web assets match the static export except generated Cordova shims.
- Physical-device visual testing is not completed. Upload/Apple processing and tester availability must be verified in App Store Connect separately.

## Not implemented in this release

Real checkout, group split payments, host payouts and refunds remain blocked on the client-owned payment processor/account and agreed payment rules. No live charges or money movements are enabled by this change.
