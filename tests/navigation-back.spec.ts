import { test, expect } from "@playwright/test";

// Mocked UI regression only, covering the three surfaces identified in the UX audit that
// didn't integrate with the browser's Back button at all: the auth modal, the mobile search
// sheet, and the host listing wizard (which additionally risked silently losing typed data).

test("browser Back closes the auth modal instead of navigating away underneath it", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "Test authentication error" } }));
  await page.goto("/");
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile\/?$/);
});

test("browser Back closes the mobile search sheet instead of navigating away underneath it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The search sheet trigger is mobile-only; desktop uses the inline search bar.");
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "Signed out" } }));
  await page.goto("/");
  const announcement = page.getByRole("button", { name: "Got it", exact: true });
  await expect(announcement).toBeVisible();
  await announcement.click();

  await page.getByRole("button", { name: "Start your search" }).click();
  await expect(page.getByRole("dialog", { name: "Search Yardly" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Search Yardly" })).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*\/?$/);
});

test("browser Back on a dirty new-listing form confirms before discarding it", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/host/listings/");
  await page.goto("/host/listings/new/");
  await expect(page.getByRole("heading", { name: "What kind of space will you share?" })).toBeVisible();
  await page.getByRole("button", { name: "Pools", exact: true }).click();

  // Cancelling the confirm keeps the form and its selection intact.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page.getByRole("heading", { name: "What kind of space will you share?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pools", exact: true })).toHaveClass(/border-brand/);

  // Confirming lets the navigation through.
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page.getByRole("heading", { name: "What kind of space will you share?" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/host\/listings\/?$/);
});
