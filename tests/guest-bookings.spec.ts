import { test, expect } from "@playwright/test";

test("guest cancellation requires confirmation before calling cancel_reservation", async ({ page }) => {
  // Mocked UI regression only. Live RLS/eligibility is exercised by the SQL rollback suite.
  const userId = "00000000-0000-4000-8000-000000000001";
  const bookingId = "00000000-0000-4000-8000-000000000090";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Guest" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  let cancelled = false;
  let attempts = 0;

  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/reservations?**", (route) => route.fulfill({
    json: [{
      id: bookingId, listing_id: "00000000-0000-4000-8000-000000000011", listing_title: "QA guest booking",
      listing_location: "Test city", listing_image: "https://example.com/test.jpg", listing_timezone: "America/New_York",
      start_at: "2090-01-01T15:00:00Z", end_at: "2090-01-01T17:00:00Z", guests: 2, total: 100.8, host_payout: 90,
      status: cancelled ? "cancelled" : "confirmed", created_at: "2026-01-01T00:00:00Z",
    }],
  }));
  await page.route("**/rest/v1/rpc/cancel_reservation", (route) => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ p_reservation_id: bookingId });
    cancelled = true;
    return route.fulfill({ json: { id: bookingId, status: "cancelled" } });
  });

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/bookings/");
  await expect(page.getByText("QA guest booking", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking", exact: true }).click();
  await expect(page.getByRole("group", { name: "Confirm cancelling this booking" })).toBeVisible();
  await page.getByRole("button", { name: "Keep booking", exact: true }).click();
  expect(attempts).toBe(0);
  await expect(page.getByRole("button", { name: "Cancel booking", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancel", exact: true }).click();
  expect(attempts).toBe(1);
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
});
