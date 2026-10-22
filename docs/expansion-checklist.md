# Expansion proposal — what's left

Checklist against the Yardly Expansion Proposal (Chesapeake Project Management
Solutions, 2026-10-10). Code for all five features is on `main`. Almost nothing
below is coding — it is deployment, decisions, and people.

Last checked 2026-10-22.

## 1. Blockers — nothing works until these are done

- [ ] **Apply the six expansion migrations to Supabase.** `20261017120000` through
      `20261017162601`. Until then the tables don't exist and `/services`,
      `/churches`, `/community`, `/services/requests` and `/booking-help` all load
      to an error or an empty state on the live site.
- [ ] **Put at least one person in `marketplace_staff`.** Every review step —
      approving a provider, approving a church listing, publishing a directory
      entry, preparing assistance suggestions — checks this table. With it empty,
      nothing can ever be approved or published. One row per staff member:
      `insert into public.marketplace_staff(user_id) values ('<auth user id>');`
- [ ] **Deploy the drafting Edge Function and set its key.**
      `supabase secrets set ANTHROPIC_API_KEY=...` then
      `supabase functions deploy booking-assistance-draft`. Without it the
      "Draft with Claude" button reports the service is unreachable; staff can
      still prepare cases by hand.
- [ ] **Confirm the Netlify build picked up the new routes** at
      https://yardly-app.netlify.app — the five pages should exist even before
      the migrations run.

## 2. Decisions for Tim — these are business calls, not code

- [ ] **Approve or reject the $49 fee, in writing.** The code deliberately treats
      it as a preview only: every fee record says "Charged: no", and the UI says
      it stays informational until billing terms are approved separately. Nothing
      charges a card today.
- [ ] **Decide whether Yardly takes a commission.** As proposed, services,
      rentals, churches and the directory all send money straight to the
      provider. The $49 is the only Yardly revenue, and only when a booking
      confirms. Worth settling before launch, because adding a commission later
      changes the provider agreement.
- [ ] **Approve the provider and church listing review standard** — what gets
      approved, what gets sent back, and who reviews it.
- [ ] **Agree the photo permission wording** with each church before publishing
      their photos. The database records a permission statement per church and
      will not publish without one.

## 3. Code still genuinely missing

- [ ] **Payment capability for the $49.** No payment processor exists anywhere in
      the repo — no Stripe dependency, no charge path. The static export has no
      server, so this needs an Edge Function plus a processor account. Blocked on
      Tim's approval above; do not build it before that.
- [ ] **Notifications.** The proposal says Yardly "sends updates" and the launch
      checks cover notifications. There is no transactional email or SMS service
      in the project — the only mail today is Supabase's own auth email. A quote
      arriving, a quote being sent, a booking confirming: none of these notify
      anyone. Someone must be watching the page to notice.
- [ ] **Photo upload for provider profiles.** Work samples are entered as URLs.
      Hosts already upload listing photos to Supabase storage; providers should
      use the same path.
- [ ] **Run `deno check` on the Edge Function before deploying.** It has never
      been type-checked — Deno is not installed in this checkout.

## 4. Content and recruitment — Joel's side of the proposal

- [ ] **Recruit and onboard the first photographers.** The marketplace works but
      is empty; photography is the first category.
- [ ] **Recruit the first rental business** and load its inventory, with delivery,
      setup and pickup details (the database requires all three before an
      equipment profile can be submitted).
- [ ] **Sign up 3 churches** and prepare their listings.
- [ ] **Shoot the 3 churches** — one visit each, up to 60 minutes, 10 edited
      photos per church, one round of minor edits, DMV travel included.
- [ ] **Seed the community directory** with real parks, gyms and rec centers,
      each with its official reservation URL and a verification note.
- [ ] **Set up the weekly recheck routine** for directory entries. Entries go
      stale on a timer and the staff UI has a recheck queue, but someone has to
      work it, and a stale entry hides its official link.

## 5. Launch checks the proposal commits to

- [ ] Walk Tim through all five additions before launch.
- [ ] Verify listings, requests, quotes, notifications and confirmations end to
      end with a real provider and a real customer.
- [ ] Verify privacy: a provider sees the request details, not the planner's
      stored profile.
- [ ] Verify the customer approves the exact application revision before anything
      is submitted.
- [ ] Verify fee collection and refunds — only meaningful once §2 and §3 are
      settled.
- [ ] Start the 30 days of post-launch support, tracking requests, confirmed
      bookings, feedback and time spent.

## Out of scope as built

The AI assistant drafts suggestions and application text for staff to edit; it
does not submit anything, and it never supplies a venue URL, because a
fabricated official link is the worst failure this feature could produce. Staff
find and paste the real link. See `docs/booking-assistance-drafting.md`.
