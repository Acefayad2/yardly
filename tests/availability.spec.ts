import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_HOURS, scheduleError } from "../src/lib/availability";

const yardId = "00000000-0000-4000-8000-000000000011";
const userId = "00000000-0000-4000-8000-000000000001";
const yard = { id: yardId, host_id: userId, title: "Availability QA yard", location: "Test city", timezone: "America/Los_Angeles", space_type: "Backyards", hourly_price: 20, min_hours: 2, capacity: 5, description: "QA fixture", images: ["https://example.com/yard.jpg"], latitude: 34, longitude: -118, status: "published", created_at: "2026-01-01T00:00:00Z" };
const futureDate = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }) => {
  // UI-only fixtures. The SQL suite separately proves real database enforcement.
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/listings?**", (route) => route.fulfill({ json: [yard] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "Signed out" } }));
});

async function signIn(page: Page) {
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
}

test("weekly hours validate minimum duration", () => {
  expect(scheduleError(DEFAULT_HOURS, 2)).toBe("");
  expect(scheduleError([[12, 13], null, null, null, null, null, null], 2)).toContain("at least 2 hours");
  expect(scheduleError(Array(7).fill(null), 2)).toBe("");
});

test("host saves weekly hours and blocked dates and restores them", async ({ page }, testInfo) => {
  let saved = { weekly_hours: DEFAULT_HOURS, blocked_dates: [] as string[] };
  await page.route("**/rest/v1/listings?**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") { saved = request.postDataJSON(); return route.fulfill({ json: { id: yardId } }); }
    if (request.url().includes("weekly_hours")) return route.fulfill({ json: saved });
    return route.fulfill({ json: [yard] });
  });
  await signIn(page);
  await page.goto(`/host/listings/availability/?id=${yardId}`);
  await page.getByLabel("Monday opens", { exact: true }).selectOption("10");
  await page.getByLabel("Monday closes", { exact: true }).selectOption("18");
  await page.getByRole("checkbox", { name: "Sunday", exact: true }).uncheck();
  await page.getByLabel("Date to block").fill(futureDate());
  await page.getByRole("button", { name: "Block date", exact: true }).click();
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Availability saved" })).toBeVisible();
  expect(saved.weekly_hours[0]).toBeNull();
  expect(saved.weekly_hours[1]).toEqual([10, 18]);
  expect(saved.blocked_dates).toEqual([futureDate()]);
  await page.reload();
  await expect(page.getByLabel("Monday opens", { exact: true })).toHaveValue("10");
  await expect(page.getByRole("checkbox", { name: "Sunday", exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("host-availability.png"), fullPage: true });
  await page.getByRole("button", { name: `Unblock ${futureDate()}` }).click();
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Availability saved" })).toBeVisible();
  expect(saved.blocked_dates).toEqual([]);
});

test("host cannot overwrite schedule after a load failure", async ({ page }) => {
  await page.route("**/rest/v1/listings?**", (route) => route.request().url().includes("weekly_hours")
    ? route.fulfill({ status: 400, json: { message: "Unavailable" } }) : route.fulfill({ json: [yard] }));
  await signIn(page);
  await page.goto(`/host/listings/availability/?id=${yardId}`);
  await expect(page.getByRole("alert").filter({ hasText: "couldn’t load" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save availability" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Sunday", exact: true })).toBeDisabled();
});

test("guest selects only available slots and fails closed on errors", async ({ page }, testInfo) => {
  let state = "available";
  await page.route("**/rest/v1/rpc/get_booking_slots", (route) => state === "error"
    ? route.fulfill({ status: 400, json: { message: "Unavailable" } })
    : route.fulfill({ json: state === "closed" ? [] : [{ start_hour: 10, end_hour: 12 }, { start_hour: 14, end_hour: 16 }, { start_hour: 14, end_hour: 17 }] }));
  await page.goto(`/spaces/?id=${yardId}`);
  const widget = page.locator("#booking");
  await widget.getByLabel("Date", { exact: true }).fill(futureDate());
  await expect(widget.getByRole("button", { name: "Reserve", exact: true })).toBeEnabled();
  await expect(widget.getByRole("combobox", { name: "Start", exact: true }).locator("option")).toHaveText(["10:00 AM", "2:00 PM"]);
  await widget.getByLabel("Start", { exact: true }).selectOption("14");
  await expect(widget.getByRole("combobox", { name: "Duration", exact: true }).locator("option")).toHaveText(["2 hours", "3 hours"]);
  await widget.getByLabel("Duration").selectOption("3");
  await expect(widget.getByText("$67.20", { exact: true })).toBeVisible();
  await widget.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("guest-availability.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  state = "closed";
  await widget.getByLabel("Date", { exact: true }).fill("2090-01-01");
  await expect(widget.getByText(/No available times on this date/)).toBeVisible();
  await expect(widget.getByRole("button", { name: "Reserve", exact: true })).toBeDisabled();
  state = "error";
  await widget.getByLabel("Date", { exact: true }).fill("2090-01-02");
  await expect(widget.getByRole("button", { name: "Retry availability" })).toBeVisible();
  await expect(widget.getByRole("button", { name: "Reserve", exact: true })).toBeDisabled();
  state = "available";
  await widget.getByRole("button", { name: "Retry availability" }).click();
  await expect(widget.getByRole("button", { name: "Reserve", exact: true })).toBeEnabled();
});
