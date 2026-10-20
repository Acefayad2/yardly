import { test, expect } from "@playwright/test";
import { classifyError } from "../src/lib/errors";

// The whole point of the taxonomy is that the database's own good messages survive while
// Postgres/PostgREST internals never do -- and both arrive under the SAME sqlstate, so
// classification alone is not enough.

const authored = [
  ["22023", "Guest count exceeds this space capacity."],
  ["22023", "Hosts cannot reserve their own space."],
  ["22023", "Choose a future booking time."],
  ["23P01", "That time is no longer available. Choose another time."],
  ["42501", "Sign in before reserving a space."],
  ["P0002", "This reservation cannot be cancelled."],
] as const;

for (const [code, message] of authored) {
  test(`keeps the authored ${code} message: ${message}`, () => {
    expect(classifyError({ code, message }).message).toBe(message);
  });
}

const engine = [
  ["42501", 'new row violates row-level security policy for table "reservations"'],
  ["42501", "permission denied for table listing_addresses"],
  ["23P01", 'conflicting key value violates exclusion constraint "reservations_no_active_overlap"'],
  ["23514", 'new row for relation "listings" violates check constraint "listings_published_complete"'],
  ["23505", 'duplicate key value violates unique constraint "saved_listings_pkey"'],
  ["P0002", "query returned no rows"],
  ["42703", 'column "secret" does not exist'],
] as const;

for (const [code, message] of engine) {
  test(`suppresses engine text for ${code}: ${message.slice(0, 40)}...`, () => {
    const result = classifyError({ code, message });
    expect(result.message).not.toBe(message);
    // No schema identifiers, quoted relation names or driver vocabulary may survive.
    expect(result.message).not.toMatch(/violates|permission denied|constraint|relation|column|duplicate key|returned no rows/i);
  });
}

test("classifies by sqlstate", () => {
  expect(classifyError({ code: "23P01", message: "x" }).kind).toBe("availability");
  expect(classifyError({ code: "42501", message: "x" }).kind).toBe("authorization");
  expect(classifyError({ code: "23514", message: "x" }).kind).toBe("validation");
  expect(classifyError({ code: "23505", message: "x" }).kind).toBe("conflict");
  expect(classifyError({ code: "PGRST116", message: "x" }).kind).toBe("not_found");
});

test("treats a rate-limited response as rate_limit, not unknown", () => {
  expect(classifyError({ status: 429, message: "Email rate limit exceeded" }).kind).toBe("rate_limit");
});

test("passes through Supabase Auth messages, which are written for end users", () => {
  const authError = { status: 400, message: "Invalid login credentials" };
  expect(classifyError(authError).message).toBe("Invalid login credentials");
});

test("reports connectivity failures as network rather than unknown", () => {
  expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
  expect(classifyError({ message: "NetworkError when attempting to fetch resource." }).kind).toBe("network");
});

test("falls back safely for anything unrecognised", () => {
  expect(classifyError(null).message).toBe("Something went wrong. Please try again.");
  expect(classifyError("a bare string").message).toBe("Something went wrong. Please try again.");
  expect(classifyError(undefined).kind).toBe("unknown");
});
