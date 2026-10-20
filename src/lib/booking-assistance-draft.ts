import { getSupabase } from "./supabase";

export interface DraftSuggestion { venueName: string; venueType: string; searchHint: string; rationale: string; }
export interface DraftApplication { venueName: string; applicationText: string; requiresVenuePayment: boolean; requiresPermit: boolean; openQuestions: string[]; }
export interface AssistanceDraft { suggestions: DraftSuggestion[]; application: DraftApplication; }

/**
 * Asks the booking-assistance-draft Edge Function for staff-review material.
 * Nothing is written to the case: the staff member edits each draft and submits
 * it through the existing suggestion and application functions, and supplies
 * the official venue link, which the model never provides.
 */
export async function requestAssistanceDraft(caseId: string): Promise<AssistanceDraft> {
  const { data, error } = await getSupabase().functions.invoke<{ draft?: AssistanceDraft; error?: string }>(
    "booking-assistance-draft",
    { body: { caseId } },
  );

  if (error) throw new Error(draftErrorMessage(error, data?.error));
  if (data?.error) throw new Error(data.error);
  if (!data?.draft) throw new Error("The drafting service returned nothing to review.");

  return {
    suggestions: data.draft.suggestions.slice(0, 3),
    application: data.draft.application,
  };
}

function draftErrorMessage(error: unknown, bodyError?: string): string {
  if (bodyError) return bodyError;
  if (error instanceof Error && error.message) {
    // A function that was never deployed surfaces as a generic network failure.
    if (/Failed to send|fetch/i.test(error.message)) {
      return "The drafting service is not reachable. Deploy the booking-assistance-draft function and set ANTHROPIC_API_KEY.";
    }
    return error.message;
  }
  return "Drafting failed.";
}
