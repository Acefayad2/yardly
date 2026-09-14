import { test, expect } from "@playwright/test";
import { flexibleDates, parseFlexible } from "../src/lib/search-dates";

test("flexible dates stay in one month and respect weekdays and past dates", () => {
  expect(parseFlexible("2026-13", "any")).toBeUndefined();
  expect(flexibleDates({ month: "2028-02", days: "any" }, "2028-02-28")).toEqual(["2028-02-28", "2028-02-29"]);
  const weekend = flexibleDates({ month: "2026-09", days: "weekends" }, "2026-09-14");
  expect(weekend).toEqual(["2026-09-19", "2026-09-20", "2026-09-26", "2026-09-27"]);
  expect(flexibleDates({ month: "2026-08", days: "any" }, "2026-09-14")).toEqual([]);
  expect(flexibleDates({ month: "2026-09", days: "weekdays" }, "2026-09-14").every(date => ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()))).toBe(true);
});

test("month cards submit and restore flexible preferences on desktop and mobile", async ({ page }, testInfo) => {
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", route => route.fulfill({ status: 400, json: { message: "Signed out" } }));
  await page.goto("/");
  const got = page.getByRole("button", { name: "Got it", exact: true });
  if (await got.isVisible()) await got.click();
  const mobile = testInfo.project.name === "mobile";
  if (mobile) {
    await page.getByRole("button", { name: "Start your search" }).click();
    await page.getByRole("button", { name: "When Add a date" }).click();
  } else await page.getByRole("button", { name: "When Add a date" }).click();
  await page.getByRole("button", { name: "Flexible", exact: true }).click();
  await page.getByRole("button", { name: "Weekends", exact: true }).click();
  const months = page.getByRole("group", { name: "Preferred month" }).getByRole("button");
  await expect(months).toHaveCount(12);
  await months.nth(1).click();
  const chosen = await months.nth(1).getAttribute("aria-label");
  await expect(months.nth(1)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("flexible.png") });
  const submit = page.getByRole("button", { name: "Search", exact: true });
  // Netlify's preview-only drawer covers mobile bottom controls. Production and
  // local tests still use a real click; previews additionally verify keyboard submission.
  if (mobile && process.env.TEST_BASE_URL?.includes("deploy-preview-")) await submit.press("Enter");
  else await submit.click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}&days=weekends/);
  expect(new URL(page.url()).searchParams.has("date")).toBe(false);
  if (mobile) {
    await page.getByRole("button", { name: "Start your search" }).click();
    await page.getByRole("button", { name: /When .*Weekends/ }).click();
  } else await page.getByRole("button", { name: /When .*Weekends/ }).click();
  await expect(page.getByRole("button", { name: chosen!, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dates", exact: true }).click();
  await expect(page.locator(".search-calendar__months")).toBeVisible();
});
