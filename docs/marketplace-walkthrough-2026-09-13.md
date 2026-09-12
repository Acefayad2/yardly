# Marketplace walkthrough — September 13, 2026

Preview: https://deploy-preview-9--yardly-app.netlify.app/

## Changes

- Added a responsive destination suggestions panel backed by the current marketplace inventory, with keyboard selection, filtering, clear labels, and loading/empty states.
- Reduced desktop search width, refined its shadow and focus states, and added a consistent discovery heading and loading skeletons.
- Restored URL search values in the desktop header and whenever mobile search opens.
- Removed the misleading Nearby shortcut and inactive category tabs from mobile search. The destination chooser now offers an explicit all-destinations option.
- Added mobile focus containment, step focus, Escape dismissal, focus restoration, and past-date constraints.
- Removed account-menu entries that offered unavailable features through unrelated login prompts.
- Fixed the repeated map results update loop by stabilizing the viewport callback and ignoring unchanged results.
- Corrected singular map counts, host navigation labels, new-listing ratings, hourly-price input padding, and nested main landmarks.
- Kept category emojis and the prior liquid-glass authentication design; adjusted mobile input text to avoid iOS input zoom.
- Merged current main and retained the other developer's host draft editor and hourly-price fix. Integrated the address picker into the shared create/edit form.

## Verification

- Lint, TypeScript/production build, quality audit, and production dependency audit passed; no production vulnerabilities reported.
- Desktop destination suggestions visually checked; keyboard selection of Austin produced the expected filtered listing.
- Mobile search selected Austin, September 20, and two guests and submitted all three URL parameters.
- Map/list switching and property selection exercised. No browser console errors reported during this interaction.
- Home and destination suggestions visually inspected at 390px and desktop widths.
- These routes returned HTTP 200 with no horizontal document overflow at 390px and 1280px: wishlists, trips, messages, profile, host introduction, host dashboard, host listings, new listing, edit listing, host reservations, listing detail, and trust.

## Limits and follow-up

- Route checks used the signed-out experience. They do not verify authenticated listing edits, uploads, messages, or completed reservations.
- Demo inventory is visibly labelled and cannot be booked or messaged. Real published inventory is still needed for a production transaction walkthrough.
- Netlify's injected preview toolbar can cover bottom mobile controls, even when minimized. Keyboard submission was used to complete the mobile search test; the toolbar is not part of the production app.
- The language button previously opened the account menu; it was removed until an actual translation experience is implemented.
- This PR includes the earlier unmerged PR #6 design work. Review and release it as one combined change to avoid reverting the draft-editor work on main.
