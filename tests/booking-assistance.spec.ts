import { expect, test, type Page } from "@playwright/test";
import { mapAssistanceCase } from "../src/lib/booking-assistance";

const customerId = "00000000-0000-4000-8000-000000000071";
const staffId = "00000000-0000-4000-8000-000000000072";
const caseId = "00000000-0000-4000-8000-000000000073";
const applicationId = "00000000-0000-4000-8000-000000000074";

test("assistance rows map reviewed suggestions, applications, and a noncharging fee preview", () => {
  const item = mapAssistanceCase(caseRow());
  expect(item.suggestions).toHaveLength(1);
  expect(item.applications[0]).toMatchObject({ revision: 3, outcome: "active", customerApprovedAt: null, requiresPayment: true, requiresPermit: true });
  expect(item.feePreview).toEqual({ state: "not_evaluated", reason: "", charged: false });
});

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "No session" } }));
});

test("booking help is private and makes human review explicit", async ({ page }) => {
  await page.goto("/booking-help/");
  await expect(page.getByRole("heading", { name: "Sign in to request booking help" })).toBeVisible();
  await expect(page.getByText("application drafts, and approvals remain private")).toBeVisible();
});

test("customer opens a human-reviewed case without a charge", async ({ page }) => {
  await mockLogin(page, customerId, "customer@example.com");
  await page.route("**/rest/v1/booking_assistance_cases**", (route) => route.fulfill({ json: [] }));
  const created = page.waitForRequest((request) => request.url().includes("/rpc/create_booking_assistance_case") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/create_booking_assistance_case", (route) => route.fulfill({ json: { id: caseId, status: "intake" } }));
  await page.goto("/booking-help/"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await login(page, "customer@example.com");
  await page.getByLabel("Event date").fill("2090-05-20"); await page.getByLabel("Location").fill("Washington, DC"); await page.getByLabel("Guest count").fill("90"); await page.getByLabel("Event type").fill("Community celebration"); await page.getByLabel(/What does the venue/).fill("Need an accessible venue with tables, parking, and a kitchen.");
  await page.getByRole("button", { name: "Request human-reviewed help" }).click();
  expect((await created).postDataJSON()).toEqual({ p_event_date: "2090-05-20", p_location: "Washington, DC", p_guest_count: 90, p_event_type: "Community celebration", p_needs: "Need an accessible venue with tables, parking, and a kitchen." });
  await expect(page.getByText("Booking-help case opened for human review.")).toBeVisible();
});

test("customer approves the exact staff-checked application before submission", async ({ page }) => {
  await mockLogin(page, customerId, "customer@example.com");
  await page.route("**/rest/v1/booking_assistance_cases**", (route) => route.fulfill({ json: [caseRow()] }));
  const approval = page.waitForRequest((request) => request.url().includes("/rpc/approve_booking_assistance_application") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/approve_booking_assistance_application", (route) => route.fulfill({ json: { id: applicationId, customer_approved_at: new Date().toISOString() } }));
  await page.goto("/booking-help/"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await login(page, "customer@example.com");
  await expect(page.getByText("Please consider this application")).toBeVisible();
  await expect(page.getByText("no charge capability")).toBeVisible();
  const summary = page.locator('dl[aria-label="Exact application approval summary"]');
  await expect(summary.getByRole("link", { name: "https://example.gov/center" })).toHaveAttribute("target", "_blank");
  await expect(summary).toContainText("Immutable revision3");
  await expect(summary).toContainText("Venue payment requiredYes");
  await expect(summary).toContainText("Permit requiredYes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Approve this exact application" }).click();
  expect((await approval).postDataJSON()).toEqual({ p_application_id: applicationId, p_expected_revision: 3 });
});

test("staff confirmation captures written approval and required records", async ({ page }) => {
  await mockLogin(page, staffId, "staff@example.com");
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: { user_id: staffId } }));
  await page.route("**/rest/v1/booking_assistance_cases**", (route) => route.fulfill({ json: [caseRow({ approved: true, submitted: true })] }));
  const confirmed = page.waitForRequest((request) => request.url().includes("/rpc/confirm_booking_assistance_application") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/confirm_booking_assistance_application", (route) => route.fulfill({ json: { id: applicationId, confirmed_at: new Date().toISOString() } }));
  await page.goto("/booking-help/"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await login(page, "staff@example.com");
  await page.getByLabel("Written venue approval evidence").fill("Written venue approval email received and archived.");
  await page.getByLabel("Venue payment record").fill("Receipt reference PAY-123 archived."); await page.getByLabel("Permit record").fill("Permit reference PERMIT-456 archived.");
  await page.getByRole("button", { name: "Record venue confirmation" }).click();
  expect((await confirmed).postDataJSON()).toEqual({ p_application_id: applicationId, p_written_approval_evidence: "Written venue approval email received and archived.", p_venue_payment_record: "Receipt reference PAY-123 archived.", p_permit_record: "Permit reference PERMIT-456 archived." });
});

function caseRow({ approved = false, submitted = false } = {}) { return { id: caseId, customer_id: customerId, event_date: "2090-05-20", location: "Washington, DC", guest_count: 90, event_type: "Community celebration", needs: "Need an accessible venue with tables, parking, and a kitchen.", service_deadline: "2090-05-14", status: submitted ? "submitted" : "draft_ready", confirmed_at: null, booking_assistance_suggestions: [{ id: "suggestion-1", position: 1, venue_name: "Community Center", official_url: "https://example.gov/center", rationale: "Fits the guest count, accessibility, parking, and kitchen requirements." }], booking_assistance_applications: [{ id: applicationId, sequence: 1, revision: 3, outcome: "active", resolution_reason: "", venue_name: "Community Center", official_url: "https://example.gov/center", application_text: "Please consider this application for our community celebration with ninety guests and accessibility needs.", requires_venue_payment: true, requires_permit: true, customer_approved_at: approved ? "2026-10-17T10:00:00Z" : null, submitted_at: submitted ? "2026-10-17T10:30:00Z" : null, followup_count: 0, confirmed_at: null }], booking_assistance_fee_previews: { preview_state: "not_evaluated", reason: "", fee_charged: false } }; }
async function mockLogin(page: Page, id: string, email: string) { const user = { id, aud: "authenticated", role: "authenticated", email, user_metadata: { full_name: "Assistance QA" }, app_metadata: { provider: "email" } }; const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")}.sig`; await page.unroute("**/auth/v1/**"); await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa", token_type: "bearer", expires_in: 3600, user } : user })); }
async function login(page: Page, email: string) { await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", { exact: true }).fill("assistance-test-password"); await page.getByRole("button", { name: "Log in", exact: true }).click(); }
