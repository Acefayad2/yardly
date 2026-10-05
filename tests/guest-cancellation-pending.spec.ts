import { test, expect, type Page, type Route } from "@playwright/test";

// All auth and reservation requests are synthetic. No live records are accessed.
async function pendingCancellationFixture(page: Page) {
  const userId = "00000000-0000-4000-8000-000000000001";
  const bookingIds = ["00000000-0000-4000-8000-000000000090", "00000000-0000-4000-8000-000000000091"];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Guest" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  const cancelled = new Set<string>();
  const requests: { route: Route; id: string }[] = [];

  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/reservations?**", (route) => route.fulfill({
    json: bookingIds.map((id, index) => ({
      id, guest_id: userId, listing_id: "00000000-0000-4000-8000-000000000011", listing_title: `Pending QA booking ${index + 1}`,
      listing_location: "Test city", listing_image: "https://example.com/test.jpg", listing_timezone: "America/New_York",
      start_at: "2090-01-01T15:00:00Z", end_at: "2090-01-01T17:00:00Z", guests: 2, total: 100.8, host_payout: 90,
      status: cancelled.has(id) ? "cancelled" : "confirmed", created_at: "2026-01-01T00:00:00Z",
    })),
  }));
  await page.route("**/rest/v1/rpc/cancel_reservation", (route) => {
    requests.push({ route, id: route.request().postDataJSON().p_reservation_id });
    // Deliberately held until the test releases it. Assertions run while pending.
  });

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
  await page.goto("/bookings/");
  await expect(page.getByText("Pending QA booking 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending QA booking 2", { exact: true })).toBeVisible();

  return {
    requests, bookingIds,
    async release(index: number, outcome: "success" | "server-error" | "network-error" = "success") {
      const { route, id } = requests[index];
      if (outcome === "network-error") return route.abort("failed");
      if (outcome === "server-error") return route.fulfill({ status: 400, json: { code: "P0002", message: "This reservation cannot be cancelled." } });
      cancelled.add(id);
      await route.fulfill({ json: { id, status: "cancelled" } });
    },
  };
}

test("guest cancellation holds every card until the pending request settles", async ({ page }) => {
  const fixture = await pendingCancellationFixture(page);
  await page.getByRole("button", { name: "Cancel booking", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm cancel", exact: true }).click();
  await expect.poll(() => fixture.requests.length).toBe(1);

  const pending = page.getByRole("group", { name: "Confirm cancelling this booking" });
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Cancelling…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Keep booking", exact: true })).toBeDisabled();
  const otherBooking = page.getByRole("button", { name: "Cancel booking", exact: true });
  await expect(otherBooking).toHaveCount(1);
  await expect(otherBooking).toBeDisabled();
  await otherBooking.dispatchEvent("click");
  await page.getByRole("button", { name: "Cancelling…", exact: true }).dispatchEvent("click");
  expect(fixture.requests.map((request) => request.id)).toEqual([fixture.bookingIds[0]]);

  await fixture.release(0);
  await expect(page.getByText("cancelled", { exact: true })).toHaveCount(1);
  await expect(pending).toHaveCount(0);
  await expect(otherBooking).toBeEnabled();
  await otherBooking.click();
  await page.getByRole("button", { name: "Confirm cancel", exact: true }).click();
  await expect.poll(() => fixture.requests.length).toBe(2);
  expect(fixture.requests[1].id).toBe(fixture.bookingIds[1]);
  await fixture.release(1);
  await expect(page.getByText("cancelled", { exact: true })).toHaveCount(2);
});

for (const failure of ["server-error", "network-error"] as const) {
  test(`guest can dismiss and deliberately retry after a delayed ${failure}`, async ({ page }) => {
    const fixture = await pendingCancellationFixture(page);
    await page.getByRole("button", { name: "Cancel booking", exact: true }).first().click();
    await page.getByRole("button", { name: "Confirm cancel", exact: true }).click();
    await expect.poll(() => fixture.requests.length).toBe(1);
    await expect(page.getByRole("button", { name: "Cancelling…", exact: true })).toBeDisabled();
    await fixture.release(0, failure);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("confirmed", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Confirm cancel", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Keep booking", exact: true }).click();
    await expect(page.getByRole("group", { name: "Confirm cancelling this booking" })).toHaveCount(0);
    expect(fixture.requests.length).toBe(1);

    await page.getByRole("button", { name: "Cancel booking", exact: true }).first().click();
    await page.getByRole("button", { name: "Confirm cancel", exact: true }).click();
    await expect.poll(() => fixture.requests.length).toBe(2);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(fixture.requests[1].id).toBe(fixture.bookingIds[0]);
    await fixture.release(1);
    await expect(page.getByText("cancelled", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Cancel booking", exact: true })).toBeEnabled();
  });
}
