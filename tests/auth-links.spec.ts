import { test, expect } from "@playwright/test";

test("expired account links offer recovery without exposing URL error text", async ({ page }) => {
  await page.route("**/auth/v1/**", route => route.fulfill({ status: 400, json: { message: "Expired" } }));
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.goto("/reset-password/?error=access_denied&error_code=otp_expired");
  await expect(page.getByRole("alert").filter({ hasText: "This account link" })).toContainText("expired or no longer valid");
  await expect(page.getByRole("link", { name: "Request password reset", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in or resend confirmation" }).click();
  await page.getByLabel("Email address", { exact: true }).last().fill("qa@example.com");
  let count = 0;
  await page.route("**/auth/v1/resend**", route => { count++; return route.fulfill({ json: {} }); });
  await page.getByRole("button", { name: "Resend confirmation email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("a new link is on its way");
  await page.getByRole("button", { name: "Resend confirmation email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("wait a minute");
  expect(count).toBe(1);
});
