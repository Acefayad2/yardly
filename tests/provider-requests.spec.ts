import { expect, test, type Page } from "@playwright/test";
import { mapProviderRequest, validateRequestedItems } from "../src/lib/provider-requests";

const customerId = "00000000-0000-4000-8000-000000000051";
const providerOwnerId = "00000000-0000-4000-8000-000000000052";
const providerId = "00000000-0000-4000-8000-000000000053";
const requestId = "00000000-0000-4000-8000-000000000054";
const chairItemId = "00000000-0000-4000-8000-000000000055";
const tableItemId = "00000000-0000-4000-8000-000000000056";

test("provider request domain validates inventory identifiers and maps quote revision", () => {
  expect(validateRequestedItems([{ inventory_item_id: chairItemId, quantity: 30 }])).toBe(true);
  expect(validateRequestedItems([{ inventory_item_id: "", quantity: 30 }])).toBe(false);
  expect(validateRequestedItems([{ inventory_item_id: chairItemId, quantity: 2.5 }])).toBe(false);

  const request = mapProviderRequest(requestRow({ accepted: true }));
  expect(request.status).toBe("quoted");
  expect(request.providerOwnerId).toBe(providerOwnerId);
  expect(request.quote).toMatchObject({ fullPrice: 450, depositAmount: 100, revision: 2 });
  expect(request.messages.map((message) => message.body)).toEqual(["First", "Second"]);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "No test session" } }));
});

test("provider requests are private to signed-in participants", async ({ page }) => {
  await page.goto("/services/requests/");
  await expect(page.getByRole("heading", { name: "Sign in to request or manage quotes" })).toBeVisible();
  await expect(page.getByText("Provider requests and messages are private")).toBeVisible();
});

test("customer sends a quantity-aware equipment request without checkout", async ({ page }) => {
  await signIn(page, customerId, "customer@example.com");
  await page.route("**/rest/v1/provider_profiles**", (route) => route.fulfill({ json: providerRow() }));
  await page.route("**/rest/v1/provider_requests**", (route) => route.fulfill({ json: [] }));
  const sent = page.waitForRequest((request) => request.url().includes("/rest/v1/rpc/create_provider_request") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/create_provider_request", (route) => route.fulfill({ json: { id: requestId, status: "waiting_for_reply" } }));

  await page.goto(`/services/requests/?provider=${providerId}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await logIn(page, "customer@example.com");
  await expect(page.getByRole("heading", { name: "Gather Rentals" })).toBeVisible();
  await page.getByLabel("Event date").fill("2090-01-20");
  await page.getByLabel("Location").fill("Northside Community Hall");
  await page.getByLabel("Start time").fill("15:00");
  await page.getByLabel("End time").fill("20:00");
  await page.getByLabel("Guest count").fill("60");
  await page.getByLabel("What do you need?").fill("Seating delivered and collected for a community dinner.");
  await page.getByLabel("Folding chair quantity").fill("60");
  await page.getByLabel("Folding chair options").fill("white; delivery requested");
  await page.getByLabel("Six-foot table quantity").fill("8");
  await page.getByLabel("Six-foot table options").fill("setup requested");
  await page.getByRole("button", { name: "Send request" }).click();

  expect((await sent).postDataJSON()).toEqual({
    p_provider_id: providerId,
    p_event_date: "2090-01-20",
    p_start_time: "15:00",
    p_end_time: "20:00",
    p_event_location: "Northside Community Hall",
    p_guest_count: 60,
    p_needs: "Seating delivered and collected for a community dinner.",
    p_items: [
      { inventory_item_id: chairItemId, quantity: 60, options: "white; delivery requested" },
      { inventory_item_id: tableItemId, quantity: 8, options: "setup requested" },
    ],
  });
  await expect(page.getByRole("status").filter({ hasText: "Nothing is reserved until the provider confirms" })).toBeVisible();
  await expect(page.getByText(/checkout|pay now/i)).toHaveCount(0);
});

test("customer explicitly accepts a separate quote and direct-provider payment terms", async ({ page }) => {
  await signIn(page, customerId, "customer@example.com");
  let accepted = false;
  await page.route("**/rest/v1/provider_requests**", (route) => route.fulfill({ json: [requestRow({ accepted })] }));
  const acceptance = page.waitForRequest((request) => request.url().includes("/rest/v1/rpc/accept_provider_quote") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/accept_provider_quote", (route) => { accepted = true; return route.fulfill({ json: { id: requestId, status: "quoted" } }); });

  await page.goto("/services/requests/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await logIn(page, "customer@example.com");
  await expect(page.getByText("Full price")).toBeVisible();
  await expect(page.getByText("$450.00")).toBeVisible();
  await expect(page.getByText("Providers collect their own payments")).toBeVisible();
  await page.getByRole("button", { name: "Accept quote and acknowledge direct payment" }).click();
  expect((await acceptance).postDataJSON()).toEqual({ p_request_id: requestId, p_expected_revision: 2, p_direct_payment_acknowledged: true });
  await expect(page.getByText("Customer accepted and recorded direct-provider payment acknowledgment.")).toBeVisible();
  await expect(page.getByText("The provider must still confirm the booking.")).toBeVisible();
});

test("provider can confirm only an accepted quote", async ({ page }) => {
  await signIn(page, providerOwnerId, "provider@example.com");
  await page.route("**/rest/v1/provider_requests**", (route) => route.fulfill({ json: [requestRow({ accepted: true })] }));
  const confirmation = page.waitForRequest((request) => request.url().includes("/rest/v1/rpc/confirm_provider_request") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/confirm_provider_request", (route) => route.fulfill({ json: { id: requestId, status: "confirmed" } }));

  await page.goto("/services/requests/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await logIn(page, "provider@example.com");
  await expect(page.getByText("Provider view")).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  expect((await confirmation).postDataJSON()).toEqual({ p_request_id: requestId });
  await expect(page.getByText("Provider booking confirmed.")).toBeVisible();
});

async function signIn(page: Page, id: string, email: string) {
  const user = { id, aud: "authenticated", role: "authenticated", email, user_metadata: { full_name: "Workflow QA" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.unroute("**/auth/v1/**");
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
}

async function logIn(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("workflow-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

function providerRow() {
  return {
    id: providerId, owner_id: providerOwnerId, kind: "equipment", business_name: "Gather Rentals", category: "Tables and chairs",
    service_area: "Washington, DC", summary: "Reviewed rentals for celebrations, nonprofit events, and neighborhood gatherings.",
    offerings: ["Chair rental", "Table rental"], starting_price: 4.5, sample_urls: ["https://example.com/chair.jpg"],
    delivery_details: "Quoted by distance", setup_details: "Available by quote", pickup_details: "Scheduled with the provider",
    review_state: "approved", submitted_at: "2026-10-15T12:00:00Z", reviewed_at: "2026-10-16T12:00:00Z",
    provider_inventory_items: [{ id: chairItemId, name: "Folding chair", quantity_available: 80 }, { id: tableItemId, name: "Six-foot table", quantity_available: 12 }],
  };
}

function requestRow({ accepted }: { accepted: boolean }) {
  return {
    id: requestId, provider_id: providerId, customer_id: customerId, event_date: "2090-01-20", start_time: "15:00:00", end_time: "20:00:00",
    event_location: "Northside Community Hall", guest_count: 60, needs: "Seating delivered and collected for a community dinner.", status: "quoted",
    updated_at: "2026-10-17T10:00:00Z", provider_profiles: { business_name: "Gather Rentals", owner_id: providerOwnerId, kind: "equipment" },
    provider_request_items: [{ id: "item-1", inventory_item_id: chairItemId, item_name: "Folding chair", quantity: 60, options: "white; delivery requested" }],
    provider_quotes: { full_price: "450.00", deposit_amount: "100.00", cancellation_terms: "Deposit is nonrefundable after seven days.", inclusions: "Sixty chairs, delivery, setup, and pickup.", revision: 2, quoted_at: "2026-10-17T09:00:00Z", accepted_at: accepted ? "2026-10-17T09:30:00Z" : null, direct_payment_acknowledged_at: accepted ? "2026-10-17T09:30:00Z" : null, confirmed_at: null },
    provider_request_messages: [
      { id: "message-2", sender_id: providerOwnerId, body: "Second", created_at: "2026-10-17T09:02:00Z" },
      { id: "message-1", sender_id: customerId, body: "First", created_at: "2026-10-17T09:01:00Z" },
    ],
  };
}
