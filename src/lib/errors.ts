// One authoritative place to turn anything thrown by Supabase, Postgres or the network
// into something safe to put in front of a user.
//
// The database already follows a deliberate convention: every `raise exception` in
// supabase/migrations uses an explicit errcode and a message written for a human
// ("Guest count exceeds this space capacity."). Those messages are good and must
// survive.
//
// The leak is the other direction -- the same sqlstates are ALSO raised by Postgres
// itself, with text that exposes schema internals:
//
//   42501 ours:   "Sign in before reserving a space."
//   42501 engine: "new row violates row-level security policy for table \"reservations\""
//   23P01 ours:   "That time is no longer available. Choose another time."
//   23P01 engine: "conflicting key value violates exclusion constraint \"reservations_...\""
//
// So classification is by sqlstate, and the DB's own text is used only when it does not
// look like engine output. Anything engine-shaped is replaced with our own wording for
// that class.

export type ErrorKind =
  | "validation"
  | "authorization"
  | "not_found"
  | "conflict"
  | "availability"
  | "rate_limit"
  | "network"
  | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  /** Safe to render to a user. Never contains schema or driver internals. */
  message: string;
  /** sqlstate or provider code, for logs only. */
  code?: string;
}

const FALLBACK: Record<ErrorKind, string> = {
  validation: "Some of those details aren't valid. Check them and try again.",
  authorization: "You don't have access to do that. Try signing in again.",
  not_found: "We couldn't find that. It may have been changed or removed.",
  conflict: "That's already been saved. Refresh to see the latest.",
  availability: "That time is no longer available. Choose another time.",
  rate_limit: "Too many attempts. Wait a moment and try again.",
  network: "We couldn't reach Yardly. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

const KIND_BY_SQLSTATE: Record<string, ErrorKind> = {
  "22023": "validation", // invalid_parameter_value -- our booking/availability guards
  "22001": "validation", // string_data_right_truncation
  "22007": "validation", // invalid_datetime_format
  "23502": "validation", // not_null_violation
  "23503": "validation", // foreign_key_violation
  "23514": "validation", // check_violation
  "23505": "conflict", // unique_violation
  "23P01": "availability", // exclusion_violation -- the double-booking guard
  "42501": "authorization", // insufficient_privilege -- includes RLS denials
  P0002: "not_found", // no_data_found
  PGRST116: "not_found", // PostgREST: no rows returned
  PGRST301: "authorization", // PostgREST: JWT expired / invalid
};

// Text shapes that only ever come from Postgres/PostgREST itself. If a message matches,
// it is never shown to a user regardless of how benign it looks.
const ENGINE_TEXT =
  /violates |permission denied|query returned no rows|duplicate key|syntax error|invalid input syntax|does not exist|relation "|constraint "|column "|table "|schema "|JWT|stack depth|deadlock detected/i;

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value ? value : undefined;
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return { kind: "network", message: FALLBACK.network };
  }
  if (!error || typeof error !== "object") {
    return { kind: "unknown", message: FALLBACK.unknown };
  }

  const source = error as Record<string, unknown>;
  const code = readString(source, "code");
  const raw = readString(source, "message");
  const status = typeof source.status === "number" ? source.status : undefined;

  if (status === 429) return { kind: "rate_limit", message: FALLBACK.rate_limit, code };
  if (raw && /failed to fetch|networkerror|load failed/i.test(raw)) {
    return { kind: "network", message: FALLBACK.network, code };
  }

  const fromSqlstate = code ? KIND_BY_SQLSTATE[code] : undefined;
  const kind: ErrorKind = fromSqlstate ?? kindFromStatus(status) ?? "unknown";

  // Supabase Auth messages are written for end users and never expose schema, so they
  // pass through. They are also the only place a non-enumerating message matters.
  const fromAuth = status !== undefined && !code?.match(/^\d{5}$|^PGRST/);
  const trustworthy = raw && (fromAuth || !ENGINE_TEXT.test(raw));

  return { kind, message: trustworthy ? raw : FALLBACK[kind], code };
}

function kindFromStatus(status: number | undefined): ErrorKind | undefined {
  if (status === undefined) return undefined;
  if (status === 401 || status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status >= 500) return "unknown";
  return undefined;
}

/**
 * User-facing message for anything thrown. Logs the full error once, with context, so
 * the detail we deliberately withhold from the user is still available to a developer.
 */
export function errorMessage(error: unknown, context?: string): string {
  const classified = classifyError(error);
  if (process.env.NODE_ENV !== "production") {
    console.error(`[yardly:${classified.kind}]${context ? ` ${context}:` : ""}`, {
      code: classified.code,
      shown: classified.message,
      original: error,
    });
  }
  return classified.message;
}
