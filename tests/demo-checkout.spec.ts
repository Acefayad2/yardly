import { test, expect } from "@playwright/test";
import { validDemoBooking } from "../src/lib/demo-bookings";

test("demo validation rejects real listing ids and invalid schedules", () => {
  const booking = { id: "DEMO-00000000-0000-4000-8000-000000000001", spaceId: "sunlit-oasis-la", date: "2027-01-20", startHour: 10, hours: 2, guests: 2, status: "confirmed" };
  expect(validDemoBooking(booking)).toBe(true);
  for (const change of [{ spaceId: "live-listing" }, { date: "2027-02-31" }, { startHour: 21 }, { hours: 0 }, { guests: 99 }, { status: "paid" }]) {
    expect(validDemoBooking({ ...booking, ...change })).toBe(false);
  }
});

test("demo checkout confirms, persists and cancels without backend writes", async ({ page }, testInfo) => {
  // Netlify's injected preview drawer sends its own analytics POSTs; it is not part of Yardly.
  // Block only that external frame so the no-write assertion still covers all app requests.
  if (process.env.TEST_BASE_URL?.includes("deploy-preview-")) {
    await page.route(/^https:\/\/app\.netlify\.com\/cdp\/?\?/, route => route.abort());
  }
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.url()); });
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", route => route.fulfill({ status: 400, json: { message: "Signed out" } }));
  await page.goto("/spaces/?id=sunlit-oasis-la");
  const got = page.getByRole("button", { name: "Got it" });
  if (await got.isVisible()) await got.click();
  const checkout = page.getByRole("region", { name: "Demo booking and checkout" });
  await expect(checkout.getByText("Demo mode · No real charge or reservation")).toBeVisible();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 2);
  await checkout.getByLabel("Demo date", { exact: true }).fill(tomorrow.toISOString().slice(0, 10));
  await checkout.getByLabel("Demo start", { exact: true }).selectOption("10");
  await checkout.getByLabel("Demo duration", { exact: true }).selectOption("3");
  await checkout.getByLabel("Demo guests", { exact: true }).selectOption("4");
  await checkout.getByRole("button", { name: "Continue to demo checkout" }).click();
  await expect(checkout.getByText("$218.40", { exact: true })).toBeVisible();
  const confirm = checkout.getByRole("button", { name: "Simulate payment & confirm" });
  await expect(confirm).toBeDisabled();
  await expect(checkout.locator('input:not([type="checkbox"])')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await checkout.screenshot({ path: testInfo.outputPath("demo-review.png") });
  await checkout.getByRole("checkbox").check();
  await confirm.click();
  await expect(checkout.getByRole("heading", { name: "Demo booking confirmed" })).toBeVisible();
  await expect(checkout.getByText(/Charged: \$0.00/)).toBeVisible();
  await checkout.getByRole("link", { name: "View demo booking" }).click();
  const demos = page.getByRole("region", { name: "Demo bookings", exact: true });
  await expect(demos.getByText("Demo · Confirmed")).toBeVisible();
  await page.reload();
  await expect(demos.getByText("Demo · Confirmed")).toBeVisible();
  await demos.getByRole("button", { name: "Cancel demo booking" }).click();
  await expect(demos.getByText("Demo · Cancelled")).toBeVisible();
  await page.reload();
  await expect(demos.getByText("Demo · Cancelled")).toBeVisible();
  await demos.screenshot({ path: testInfo.outputPath("demo-cancelled.png") });
  expect(writes).toEqual([]);
});
