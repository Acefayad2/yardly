import { test, expect } from "@playwright/test";

// Mocked UI regression only. That archived is a real, RLS-invisible status is proved by
// supabase/tests/listing-lifecycle-rollback.sql against a live database.
test("a host can archive a listing with a warning about upcoming reservations, then restore it", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const listingId = "00000000-0000-4000-8000-000000000050";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  let status = "published";
  let patchedStatus: string | null = null;

  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));

  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/listings") && request.method() === "PATCH") {
      const nextStatus: string = request.postDataJSON().status;
      status = nextStatus;
      patchedStatus = nextStatus;
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/listings")) {
      return route.fulfill({
        json: [{
          id: listingId, title: "QA archive listing", location: "Test city", neighborhood: "Test area",
          timezone: "America/Los_Angeles", space_type: "Backyards", hourly_price: 25, min_hours: 2,
          capacity: 5, description: "A temporary fixture used only for this Playwright run.",
          amenities: [], rules: [], latitude: 34, longitude: -118, images: ["https://example.com/test.jpg"],
          status, created_at: "2026-01-01T00:00:00Z", host_display_name: "QA Host", host_avatar_url: null,
          listing_addresses: [{ street_address: "1 QA Fixture Way" }],
        }],
      });
    }
    if (path.endsWith("/reservations")) {
      return route.fulfill({
        json: [{
          id: "00000000-0000-4000-8000-000000000091", listing_id: listingId, listing_title: "QA archive listing",
          listing_location: "Test city", listing_timezone: "America/Los_Angeles", start_at: "2090-01-01T15:00:00Z",
          end_at: "2090-01-01T17:00:00Z", guests: 2, host_payout: 45, total: 50.4, status: "confirmed",
          created_at: "2026-01-01T00:00:00Z", listings: { host_id: userId },
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
  await expect(page.getByText("QA archive listing", { exact: true })).toBeVisible();

  // A published listing has no Archive action -- must pause first.
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("group", { name: "Confirm archiving this listing" })).toContainText("1 upcoming reservation");
  await page.getByRole("button", { name: "Keep listing", exact: true }).click();
  expect(patchedStatus).toBe("paused");

  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Confirm archive", exact: true }).click();
  expect(patchedStatus).toBe("archived");
  await expect(page.getByText("archived", { exact: true })).toBeVisible();

  // Archived offers only Restore -- no Edit/Availability/Publish/Pause affordance.
  await expect(page.getByRole("link", { name: /edit|finish setup/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Restore", exact: true }).click();
  expect(patchedStatus).toBe("draft");
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
});
