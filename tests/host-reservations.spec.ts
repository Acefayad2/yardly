import { test, expect } from "@playwright/test";

test("host cancellation requires confirmation, preserves failed bookings, and refreshes", async ({ page }, testInfo) => {
  // Mocked UI regression only. Live RLS is exercised by the SQL rollback suite.
  const userId = "00000000-0000-4000-8000-000000000001";
  const reservationId = "00000000-0000-4000-8000-000000000090";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  let cancelled = false;
  let fail = true;
  let attempts = 0;
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/reservations?**", route => route.fulfill({ json: [{ id: reservationId, listing_id: "00000000-0000-4000-8000-000000000011", listing_title: "QA host reservation", listing_location: "Test city", listing_timezone: "America/New_York", start_at: "2090-01-01T15:00:00Z", end_at: "2090-01-01T17:00:00Z", guests: 2, host_payout: 90, total: 100.8, status: cancelled ? "cancelled" : "confirmed", created_at: "2026-01-01T00:00:00Z", listings: { host_id: userId } }] }));
  await page.route("**/rest/v1/rpc/cancel_reservation", route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ p_reservation_id: reservationId });
    if (fail) return route.fulfill({ status: 403, json: { message: "Cancellation not permitted" } });
    cancelled = true;
    return route.fulfill({ json: { id: reservationId, status: "cancelled" } });
  });
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
  await page.goto("/host/reservations/");
  await expect(page.getByText("QA host reservation", { exact: true })).toBeVisible();
  await expect(page.getByText(/not collected payments/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel reservation", exact: true }).click();
  await page.getByRole("button", { name: "Keep reservation", exact: true }).click();
  expect(attempts).toBe(0);
  await page.getByRole("button", { name: "Cancel reservation", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Cancellation not permitted" })).toBeVisible();
  await expect(page.getByText("QA host reservation", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Reservation cancelled");
  await page.getByRole("button", { name: "cancelled", exact: true }).click();
  await expect(page.getByText("QA host reservation", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel reservation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh reservations", exact: true }).click();
  await expect(page.getByText("QA host reservation", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("host-reservations-cancelled.png") });
});
