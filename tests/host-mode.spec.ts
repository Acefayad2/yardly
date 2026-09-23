import { test, expect, type Page } from "@playwright/test";

// Mocked UI regression only. That account_type grants no real access is proved by
// supabase/tests/account-type-rollback.sql against a live database.
const userId = "00000000-0000-4000-8000-000000000001";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;

type ProfileWrite = { method: string; body: Record<string, unknown> | null };
type Mocks = { profileWrites: ProfileWrite[] };

async function mockBackend(page: Page, accountType: "guest" | "both"): Promise<Mocks> {
  const mocks: Mocks = { profileWrites: [] };
  // One handler, branching explicitly: overlapping page.route patterns make which
  // handler wins depend on registration order, which is easy to get wrong.
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    if (!new URL(request.url()).pathname.endsWith("/profiles")) return route.fulfill({ json: [] });
    if (request.method() !== "GET") mocks.profileWrites.push({ method: request.method(), body: request.postDataJSON() });
    return route.fulfill({ json: { account_type: accountType } });
  });
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  return mocks;
}

async function fillCredentials(page: Page) {
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

// The home page header drops the account menu at mobile widths, so sign in from a page
// that keeps it. This is also never "/" or "/host", so it doubles as a deep-link case.
async function logInFromProfile(page: Page) {
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Open account and navigation menu" }).click();
  await page.getByRole("button", { name: "Log in or sign up" }).click();
  await fillCredentials(page);
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
}

// The header's own switch is desktop-only (lg:block), so drive the account menu, which
// exists at both tested viewports. Scoped to the open menu: at desktop widths both
// controls are present and an unscoped lookup is ambiguous.
async function switchMode(page: Page, label: "Switch to hosting" | "Switch to traveling") {
  await page.getByRole("button", { name: "Open account and navigation menu" }).click();
  await page.getByRole("menu").getByRole("button", { name: label, exact: true }).click();
}

function rememberHostingMode(page: Page) {
  return page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({ userId: id, mode: "hosting" }));
  }, ["yardly_mode", userId]);
}

test("a guest who has never hosted is offered Become a host, not a mode switch", async ({ page }) => {
  const mocks = await mockBackend(page, "guest");
  await logInFromProfile(page);

  await page.getByRole("button", { name: "Open account and navigation menu" }).click();
  await expect(page.getByRole("menu").getByRole("link", { name: "Become a host", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to hosting", exact: true })).toHaveCount(0);

  // The single most regression-prone detail: the client must never write this column,
  // or every sign-in silently promotes the account back to a host.
  expect(mocks.profileWrites).toEqual([{ method: "POST", body: { id: userId, full_name: "QA Host" } }]);
});

test("a host can switch modes and the choice survives a reload", async ({ page }) => {
  await mockBackend(page, "both");
  await logInFromProfile(page);

  await switchMode(page, "Switch to hosting");
  await expect(page).toHaveURL(/\/host\/dashboard\/?$/);

  const stored = await page.evaluate(() => localStorage.getItem("yardly_mode"));
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ userId, mode: "hosting" });

  await page.reload();
  await expect(page).toHaveURL(/\/host\/dashboard\/?$/);

  await switchMode(page, "Switch to traveling");
  await expect(page).toHaveURL(/\/$/);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("yardly_mode"))) ?? "{}")).toMatchObject({ mode: "traveling" });
});

test("logging in from the Become a host page lands a remembered host in hosting mode", async ({ page }) => {
  await mockBackend(page, "both");
  await rememberHostingMode(page);
  await page.goto("/host/");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await fillCredentials(page);
  await expect(page).toHaveURL(/\/host\/dashboard\/?$/);
});

test("logging in from a deep link never yanks the user to the dashboard", async ({ page }) => {
  await mockBackend(page, "both");
  await rememberHostingMode(page);
  await logInFromProfile(page);
  await expect(page).toHaveURL(/\/profile\/?$/);
});
