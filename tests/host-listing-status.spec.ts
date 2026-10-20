import { test, expect } from "@playwright/test";

// Mocked UI regression only. The database-side publish gate itself is exercised by the SQL
// rollback suites; this covers the client mirroring it accurately in the listings list.
test("a listing missing its street address shows Finish setup with the specific reason, not a generic Edit", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const listingId = "00000000-0000-4000-8000-000000000051";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  const status = "draft";
  let patchedStatus: string | null = null;

  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/listings") && request.method() === "PATCH") {
      patchedStatus = request.postDataJSON().status;
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/listings")) {
      return route.fulfill({
        json: [{
          id: listingId, title: "QA no-address listing", location: "Test city", neighborhood: "Test area",
          timezone: "America/Los_Angeles", space_type: "Backyards", hourly_price: 25, min_hours: 2,
          capacity: 5, description: "A temporary fixture used only for this Playwright run.",
          amenities: [], rules: [], latitude: 34, longitude: -118, images: ["https://example.com/test.jpg"],
          status, created_at: "2026-01-01T00:00:00Z", host_display_name: "QA Host", host_avatar_url: null,
          // No listing_addresses embed at all -- images and lat/long are the only two things
          // the old, looser client-side check verified, so this fixture is missing exactly
          // the field that check used to miss.
        }],
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/host/listings/");
  await expect(page.getByText("QA no-address listing", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finish setup", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByText("Add a private street address before publishing this listing.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add a private street address before publishing this listing." })).toBeVisible();
  expect(patchedStatus).toBeNull();
});

test("Pause shows in-flight feedback instead of silently flipping state", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const listingId = "00000000-0000-4000-8000-000000000052";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;

  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/listings") && request.method() === "PATCH") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/listings")) {
      return route.fulfill({
        json: [{
          id: listingId, title: "QA pause listing", location: "Test city", neighborhood: "Test area",
          timezone: "America/Los_Angeles", space_type: "Backyards", hourly_price: 25, min_hours: 2,
          capacity: 5, description: "A temporary fixture used only for this Playwright run.",
          amenities: [], rules: [], latitude: 34, longitude: -118, images: ["https://example.com/test.jpg"],
          status: "published", created_at: "2026-01-01T00:00:00Z", host_display_name: "QA Host", host_avatar_url: null,
          listing_addresses: [{ street_address: "1 QA Fixture Way" }],
        }],
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/host/listings/");
  await expect(page.getByText("QA pause listing", { exact: true })).toBeVisible();
  const patchSent = page.waitForRequest((request) => request.method() === "PATCH" && request.url().includes("/listings"));
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await patchSent;
  await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toBeVisible();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
});

test("host dashboard labels earnings as an estimate, not collected money", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;

  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/reservations?**", (route) => route.fulfill({
    json: [{
      id: "00000000-0000-4000-8000-000000000093", listing_id: "00000000-0000-4000-8000-000000000011",
      listing_title: "QA dashboard listing", listing_location: "Test city", listing_timezone: "America/New_York",
      start_at: "2090-01-01T15:00:00Z", end_at: "2090-01-01T17:00:00Z", guests: 2, host_payout: 90, total: 100.8,
      status: "confirmed", created_at: "2026-01-01T00:00:00Z", listings: { host_id: userId },
    }],
  }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/host/dashboard/");
  await expect(page.getByText("Booking value", { exact: true })).toBeVisible();
  await expect(page.getByText("estimated", { exact: true })).toBeVisible();
  await expect(page.getByText("Not collected payments or payouts", { exact: false })).toBeVisible();
});
