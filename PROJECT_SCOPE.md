# Yardly web application scope

## Product outcome

Ship a trustworthy, responsive marketplace where guests can find and reserve outdoor spaces and hosts can publish and manage them. The experience may use familiar marketplace patterns—prominent search, visual results, clear pricing, wishlists, and booking confidence—but must retain Yardly's own brand, copy, assets, and interaction details.

The web application is the active product. Capacitor and iOS packaging are outside this scope unless a task explicitly names them.

## Completion requirements

### Guest marketplace

- Search by destination, date, guests, and space category with useful empty and error states.
- Keep list and map results synchronized and usable at mobile and desktop widths.
- Show accurate listing imagery, amenities, rules, host details, pricing, availability, and reviews.
- Persist wishlists to the signed-in account across devices.
- Create real reservations in Supabase with server-enforced availability and no overlapping confirmed bookings.
- Show upcoming, past, and canceled reservations from the database; support cancellation policy outcomes.

### Accounts and communication

- Support signup, email confirmation, login, logout, recovery, and session restoration.
- Store and edit a customer profile with required contact information.
- Replace the Messages empty state with persisted guest-host conversations tied to listings or reservations.
- Protect private data with reviewed row-level security policies.

### Host workspace

- Create and edit listings with validated details, images, amenities, pricing, capacity, rules, and availability.
- Preview drafts, publish or pause listings, and show actionable upload/database errors.
- Display reservations and earnings from real database records.
- Give hosts an inbox path to answer guest questions.

### Trust, legal, and launch

- Provide complete terms, privacy, booking/cancellation, safety, and accessibility information approved by the business owner.
- Add production support contact details, canonical metadata, social preview artwork, analytics/consent decisions, and a branded not-found page.
- Verify the production domain, HTTPS, redirects, Supabase redirect URLs, email templates, and Netlify environment configuration.
- Remove sample customer activity, placeholder content, dead controls, console errors, and broken internal links.

### Engineering quality

- Lint and production build pass on every pull request.
- Critical guest and host flows have automated browser coverage.
- Database migrations are versioned and validated against a non-production environment before release.
- High-severity production dependency vulnerabilities block release.
- Accessibility checks cover keyboard navigation, focus, labels, contrast, and responsive zoom.
- Performance budgets cover image weight, initial JavaScript, and Core Web Vitals on primary routes.

## Definition of done

A task is done only when its acceptance criteria are demonstrated in the deployed preview, relevant automated checks pass, failure/empty/loading states are handled, and no placeholder substitutes for the requested behavior. The project is complete only when every requirement above is either verified in production or explicitly removed from scope by the owner.

## Known gaps at scope creation

- Guest bookings and wishlists currently use browser storage rather than account-backed records.
- Messages has no conversation or message persistence.
- Marketplace inventory and reviews are curated source data rather than database-backed records.
- Automated browser tests, accessibility checks, and performance budgets are not configured.
- Netlify deploy previews do not currently receive the public Supabase configuration, so preview runtime verification is blocked.
- The repository has active, unmerged development branches that require full base-to-head review.
