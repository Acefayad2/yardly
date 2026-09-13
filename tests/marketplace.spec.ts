import { test, expect } from "@playwright/test";
import { bookingQuote, bookingStartHour, listingToday } from "../src/lib/booking";

test("booking math matches database cents and hours", () => {
  expect(bookingQuote(19.99, 2)).toEqual({ subtotal: 39.98, serviceFee: 4.8, total: 44.78 });
  expect(bookingQuote(65, 2).total).toBe(145.6);
  for (let minimum = 1; minimum <= 14; minimum++) {
    expect(bookingStartHour(minimum)).toBeGreaterThanOrEqual(8);
    expect(bookingStartHour(minimum) + minimum).toBeLessThanOrEqual(22);
  }
  expect(listingToday("America/Los_Angeles", new Date("2026-09-13T01:00:00Z"))).toBe("2026-09-12");
});

test.beforeEach(async ({ page }) => {
  // Deterministic UI tests, not evidence of live backend correctness.
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "Test authentication error" } }));
});

test("signup requires contact details and reports auth errors", async ({ page }) => {
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Sign up", exact: true }).click();
  await expect(page.getByLabel("Phone number")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Date of birth")).toHaveAttribute("required", "");
  await page.getByRole("tab", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("invalid-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test authentication error" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("host listing editor requires authentication", async ({ page }) => {
  await page.goto("/host/listings/new/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});

test("password recovery sends a reset request and shows confirmation", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (route) => route.fulfill({ json: {} }));
  await page.goto("/reset-password/");
  await page.getByLabel("Email address").fill("qa@example.com");
  const request = page.waitForRequest((request) => request.url().includes("/auth/v1/recover") && request.method() === "POST");
  await page.getByRole("button", { name: "Send reset link" }).click();
  expect((await request).postDataJSON().email).toBe("qa@example.com");
  await expect(page.getByRole("status").filter({ hasText: "reset link is on its way" })).toBeVisible();
});

test("authenticated profile saves contact details and rejects oversized photos", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Tester", phone_number: "+12025550123", date_of_birth: "1990-01-01" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().url().includes("/token")) await route.fulfill({ json: { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } });
    else await route.fulfill({ json: user });
  });
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
  await page.getByLabel("Full name").fill("QA Updated");
  const update = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/auth/v1/user"));
  await page.getByRole("button", { name: "Save details" }).click();
  expect((await update).postDataJSON().data.full_name).toBe("QA Updated");
  await expect(page.getByRole("status").filter({ hasText: "profile details have been saved" })).toBeVisible();
  await page.goto("/host/listings/new/");
  await page.locator('input[type="file"]').setInputFiles({ name: "oversized.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByText("Choose JPG, PNG, WebP, or HEIC photos no larger than 10 MB each.")).toBeVisible();
});

test("calendar and guests submit one date without overflow", async ({ page, isMobile }) => {
  await page.goto("/");
  const announcement = page.getByRole("button", { name: "Got it", exact: true });
  if (await announcement.isVisible()) await announcement.click();
  if (isMobile) await page.getByRole("button", { name: "Start your search" }).click();
  await page.getByRole("button", { name: /^When / }).click();
  const calendar = page.locator(".search-calendar").filter({ visible: true });
  await expect(calendar).toBeVisible();
  const day = calendar.locator('.search-calendar__month').first().locator('button:not([disabled])').last();
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Next: guests/ }).click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  if (!isMobile) await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}&guests=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
