# Booking-assistance drafting

The expansion proposal's AI booking assistant collects event details, suggests
spaces and prepares an application, with the Yardly team checking the work and
the customer approving each submission. The workflow and its state machine
already live in `20261017160942_booking_assistance_workflow.sql`. This adds the
drafting step.

## Why an Edge Function

`next.config.ts` sets `output: "export"`, so the app ships as static files with
no server runtime and no route handlers. A model call needs a secret, and a
static page cannot hold one — anything in `NEXT_PUBLIC_*` is readable by every
visitor. So the call lives in a Supabase Edge Function:
`supabase/functions/booking-assistance-draft`.

## What it does, and what it deliberately does not

The function returns drafts and writes nothing. A staff member reads each draft,
edits it, and submits it through the existing
`add_booking_assistance_suggestion` and
`prepare_booking_assistance_application` functions, which still enforce every
rule they did before: staff-only, at most three suggestions, at most two
applications, one active at a time, and the customer approving an exact
application revision.

**It never returns a venue URL.** Both records require an official HTTPS link,
and a plausible-looking fabricated link is the worst thing this feature could
produce — it would send a real customer's application into nowhere, or worse,
somewhere wrong. The model returns the venue name, the venue type and a
`searchHint`, and the staff member finds and pastes the real link. The draft
panel in the UI says so, and the suggestion form puts the search hint in the URL
field's placeholder rather than filling it in.

The model is also told never to invent a price, capacity, phone number or email.
Details that matter but aren't known come back in `openQuestions`, which the UI
lists as things to confirm with the venue.

## Deploying it

Two secrets, then a deploy:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy booking-assistance-draft
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform. The
function authenticates the caller with the `Authorization` header it receives
and builds its Supabase client from that token, so row-level security applies
and the `marketplace_staff` check cannot be bypassed by calling the endpoint
directly.

Until it is deployed, the "Draft with Claude" button reports that the service is
unreachable and staff prepare suggestions by hand, exactly as before. Nothing
else on the page depends on it.

## Model and cost

`claude-opus-5-5`, adaptive thinking, effort `medium`, structured output
validated against a Zod schema. Each draft is one request — a few thousand input
tokens and a few hundred output tokens — so the per-case cost is a fraction of a
cent. The response includes its token usage if you want to log it.

A refusal comes back as HTTP 422 with the refusal category, and staff prepare
the case by hand. The function does not use server-side refusal fallbacks: the
documented fallback parameter sits on the beta messages endpoint, and combining
it with `messages.parse` is not a combination I could verify, so a refusal is
surfaced rather than silently retried on another model.

## Not verified here

The Edge Function has not been run. Deno is not installed in this checkout, so
it has not been type-checked either, and `supabase/functions` is excluded from
`tsconfig.json` because it is Deno code rather than part of the Next.js program.
The web app builds and lints clean with the UI wiring in place. Run
`deno check supabase/functions/booking-assistance-draft/index.ts` before
deploying.
