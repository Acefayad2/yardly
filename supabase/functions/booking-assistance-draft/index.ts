// Drafts booking-assistance suggestions and an application for staff review.
//
// This function never writes to the database. It returns drafts that a staff
// member reads, edits and submits through add_booking_assistance_suggestion and
// prepare_booking_assistance_application, so the proposal's rule holds: our
// team checks the work and the customer approves each submission.
//
// It also never returns a venue URL. The suggestion and application records
// require an official HTTPS link, and a fabricated one is the worst outcome
// this feature could produce, so the model returns the venue name and what to
// search for, and the staff member supplies the real link.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { z } from "zod";

const DraftSchema = z.object({
  suggestions: z
    .array(
      z.object({
        venueName: z.string(),
        venueType: z.string(),
        searchHint: z
          .string()
          .describe("What the staff member should search to find this venue's official booking page"),
        rationale: z
          .string()
          .describe("Why this venue fits the event, in at least 20 characters"),
      }),
    )
    .describe("Up to three candidate venues, best fit first"),
  application: z.object({
    venueName: z.string().describe("Which of the suggested venues this draft is addressed to"),
    applicationText: z
      .string()
      .describe("The enquiry or application text, at least 40 characters, addressed to the venue"),
    requiresVenuePayment: z.boolean(),
    requiresPermit: z.boolean(),
    openQuestions: z
      .array(z.string())
      .describe("Details the staff member must confirm with the venue before submitting"),
  }),
});

const SYSTEM_PROMPT = `You prepare draft material for Yardly's human-reviewed booking assistance service.

A Yardly staff member reads everything you produce, edits it, and only then submits it. The customer approves the exact application text before it is sent anywhere. You are drafting, not deciding and not booking.

Rules:
- Suggest at most three venues, and only kinds of public or community venue that plausibly exist for the stated location: parks, recreation centers, community centers, gyms, libraries, church halls.
- Never invent a URL, phone number, email address, price, or capacity. If a detail matters, put it in openQuestions for staff to confirm.
- searchHint is what a person would type into a search engine to reach that venue's official reservation page.
- Write applicationText as the customer's enquiry to the venue: the date, the headcount, what the event is, what they need, and a request for the venue's reservation requirements. Keep it plain and specific.
- Set requiresVenuePayment and requiresPermit to your best reading of that venue type for that kind of event. Staff verifies both.`;

const CORS_HEADERS = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in before requesting a draft." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "This function is not configured for Supabase access." }, 500);
  }
  if (!anthropicApiKey) {
    return json({ error: "Drafting is not configured. Set ANTHROPIC_API_KEY." }, 500);
  }

  let caseId: string;
  try {
    const body = await request.json();
    caseId = String(body?.caseId ?? "");
    if (!caseId) throw new Error("missing caseId");
  } catch {
    return json({ error: "Send a JSON body with a caseId." }, 400);
  }

  // The caller's own token, so row-level security decides what is readable and
  // the staff check cannot be bypassed by calling this function directly.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: user, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.user) return json({ error: "Sign in before requesting a draft." }, 401);

  const { data: staffRow, error: staffError } = await supabase
    .from("marketplace_staff")
    .select("user_id")
    .eq("user_id", user.user.id)
    .maybeSingle();

  if (staffError) return json({ error: staffError.message }, 403);
  if (!staffRow) return json({ error: "Only assigned staff can prepare drafts." }, 403);

  const { data: assistanceCase, error: caseError } = await supabase
    .from("booking_assistance_cases")
    .select("id,event_date,location,guest_count,event_type,needs,status")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError) return json({ error: caseError.message }, 400);
  if (!assistanceCase) return json({ error: "That assistance case is not available." }, 404);
  if (!["intake", "suggestions_ready"].includes(String(assistanceCase.status))) {
    return json({ error: "This case is past the drafting stage." }, 409);
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(DraftSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Event date: ${assistanceCase.event_date}`,
            `Location: ${assistanceCase.location}`,
            `Guest count: ${assistanceCase.guest_count}`,
            `Event type: ${assistanceCase.event_type}`,
            `What the venue needs to support: ${assistanceCase.needs}`,
            "",
            "Draft up to three venue suggestions and one application for staff review.",
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json(
        {
          error: "The model declined to draft this case. Prepare it by hand.",
        },
        422,
      );
    }

    const draft = response.parsed_output;
    if (!draft) return json({ error: "The draft came back unreadable. Try again." }, 502);

    return json({
      caseId,
      draft: { ...draft, suggestions: draft.suggestions.slice(0, 3) },
      reviewReminder:
        "Confirm each venue exists, paste its official HTTPS reservation link, and edit the text before submitting.",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drafting failed.";
    const status = error instanceof Anthropic.APIError ? error.status ?? 502 : 502;
    return json({ error: message }, status);
  }
});
