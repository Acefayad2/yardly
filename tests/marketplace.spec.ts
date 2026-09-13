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
  console.log(await page.locator(".search-booking-panel").evaluateAll((panels) => panels.map((panel) => ({ rect: panel.getBoundingClientRect().toJSON(), height: panel.scrollHeight, overflow: getComputedStyle(panel).overflowY, scroll: window.scrollY, viewport: innerHeight }))));
  await page.getByRole("button", { name: /Next: guests/ }).click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  if (!isMobile) await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}&guests=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
