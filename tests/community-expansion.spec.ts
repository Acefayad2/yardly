import { expect, test, type Page } from "@playwright/test";
import { churchListingPayload, validateChurchListing } from "../src/lib/churches";
import { isCommunitySpaceStale, mapCommunitySpace } from "../src/lib/community-spaces";

const userId = "00000000-0000-4000-8000-000000000061";
const ownerId = "00000000-0000-4000-8000-000000000062";
const churchId = "00000000-0000-4000-8000-000000000063";
const spaceId = "00000000-0000-4000-8000-000000000064";
const staffId = "00000000-0000-4000-8000-000000000065";

test("church listing validation requires HTTPS photos and a permission record", () => {
  const form = new FormData();
  Object.entries({ churchName: "Community Church", spaceName: "Fellowship Hall", location: "Washington, DC", description: "A welcoming and flexible gathering hall for neighborhood events.", capacity: "120", price: "$150 per hour", amenities: "Kitchen, Parking", rules: "No smoking; cleanup required.", contact: "Church office", photos: "https://example.com/hall.jpg" }).forEach(([key, value]) => form.set(key, value));
  const payload = churchListingPayload(ownerId, form);
  expect(validateChurchListing(payload, "Authorized in writing by the church representative.")).toEqual([]);
  expect(validateChurchListing({ ...payload, photo_urls: ["http://example.com/hall.jpg"] }, "short")).toEqual(expect.arrayContaining(["Add at least one HTTPS church photo URL.", "Record how the church granted photo permission."]));
});

test("community freshness expires after seven days", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  expect(isCommunitySpaceStale("2026-10-11T12:00:01Z", now)).toBe(false);
  expect(isCommunitySpaceStale("2026-10-10T11:59:59Z", now)).toBe(true);
  expect(mapCommunitySpace(communityRow("2026-10-17T09:00:00Z")).officialUrl).toBe("https://example.gov/center");
});

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "No test session" } }));
});

test("churches and community directory have honest empty states", async ({ page }) => {
  await page.goto("/churches/");
  await expect(page.getByRole("heading", { name: "No approved church spaces yet" })).toBeVisible();
  await page.goto("/community/");
  await expect(page.getByRole("heading", { name: "No verified community spaces yet" })).toBeVisible();
});

test("customer sends a separate church event request", async ({ page }) => {
  await mockLogin(page, userId, "customer@example.com");
  await page.route("**/rest/v1/church_listings**", (route) => route.fulfill({ json: [churchRow()] }));
  await page.route("**/rest/v1/church_event_requests**", (route) => route.fulfill({ json: [] }));
  const sent = page.waitForRequest((request) => request.url().includes("/rpc/create_church_event_request") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/create_church_event_request", (route) => route.fulfill({ json: { id: "request-1", status: "waiting_for_reply" } }));
  await page.goto("/churches/");
  await page.getByRole("button", { name: "Request this space" }).click();
  await login(page, "customer@example.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Request this space" }).click();
  await page.getByLabel("Date").fill("2090-03-10");
  await page.getByLabel("Guests").fill("80");
  await page.getByLabel("Start").fill("15:00");
  await page.getByLabel("End").fill("19:00");
  await page.getByLabel("Event type").fill("Community dinner");
  await page.getByLabel("Event details").fill("Dinner and program for local families.");
  await page.getByRole("button", { name: "Send request" }).click();
  expect((await sent).postDataJSON()).toEqual({ p_church_id: churchId, p_event_date: "2090-03-10", p_start_time: "15:00", p_end_time: "19:00", p_guest_count: 80, p_event_type: "Community dinner", p_details: "Dinner and program for local families." });
  await expect(page.getByText("no booking or payment was created")).toBeVisible();
});

test("church representative records permission before staff review", async ({ page }) => {
  await mockLogin(page, ownerId, "church@example.com");
  await page.route("**/rest/v1/church_listings**", (route) => route.request().method() === "POST" ? route.fulfill({ json: { id: churchId } }) : route.fulfill({ json: [] }));
  await page.route("**/rest/v1/church_event_requests**", (route) => route.fulfill({ json: [] }));
  const permission = page.waitForRequest((request) => request.url().includes("/rpc/record_church_photo_permission") && request.method() === "POST");
  const submitted = page.waitForRequest((request) => request.url().includes("/rpc/submit_church_listing") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/record_church_photo_permission", (route) => route.fulfill({ json: { church_id: churchId, permission_granted: true } }));
  await page.route("**/rest/v1/rpc/submit_church_listing", (route) => route.fulfill({ json: { id: churchId, review_state: "pending" } }));
  await page.goto("/churches/");
  await page.getByRole("button", { name: "List a church space" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await login(page, "church@example.com");
  await page.getByLabel("Church name").fill("Community Church"); await page.getByLabel("Space name").fill("Fellowship Hall"); await page.getByLabel("Location").fill("Washington, DC"); await page.getByLabel("Capacity").fill("120"); await page.getByLabel("Published price").fill("$150 per hour"); await page.getByLabel("Booking contact name").fill("Church office");
  await page.getByLabel("Description").fill("A welcoming and flexible gathering hall for neighborhood events."); await page.getByLabel(/Amenities/).fill("Kitchen, Parking"); await page.getByLabel("Rules").fill("No smoking; cleanup required."); await page.getByLabel(/Approved HTTPS/).fill("https://example.com/hall.jpg"); await page.getByLabel("Photo-permission record").fill("Authorized in writing by the church representative for Yardly publication.");
  await page.getByRole("button", { name: "Approve and submit for review" }).click();
  expect((await permission).postDataJSON()).toEqual({ p_church_id: churchId, p_permission_granted: true, p_permission_statement: "Authorized in writing by the church representative for Yardly publication." });
  expect((await submitted).postDataJSON()).toEqual({ p_church_id: churchId });
});

test("church representative can correct a rejected listing and revoke photo permission", async ({ page }) => {
  await mockLogin(page, ownerId, "church@example.com");
  await page.route("**/rest/v1/church_listings**", (route) => {
    if (route.request().method() === "PATCH") return route.fulfill({ json: { id: churchId } });
    return route.fulfill({ json: [churchRow("rejected")] });
  });
  await page.route("**/rest/v1/church_photo_permissions**", (route) => route.fulfill({ json: [{ church_id: churchId, permission_granted: true, permission_statement: "Authorized in writing for Yardly publication." }] }));
  await page.route("**/rest/v1/church_listing_reviews**", (route) => route.fulfill({ json: [{ church_id: churchId, review_note: "Clarify the cleanup rules." }] }));
  await page.route("**/rest/v1/church_event_requests**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: null }));
  await page.route("**/rest/v1/rpc/record_church_photo_permission", (route) => route.fulfill({ json: { church_id: churchId } }));
  await page.route("**/rest/v1/rpc/submit_church_listing", (route) => route.fulfill({ json: { id: churchId, review_state: "pending" } }));

  await page.goto("/churches/");
  await page.getByRole("button", { name: "List a church space" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await login(page, "church@example.com");
  await expect(page.getByText("Clarify the cleanup rules.").first()).toBeVisible();

  const revoked = page.waitForRequest((request) => request.url().includes("/rpc/record_church_photo_permission") && request.method() === "POST" && request.postDataJSON().p_permission_granted === false);
  await page.getByRole("button", { name: "Revoke photo permission" }).click();
  expect((await revoked).postDataJSON()).toMatchObject({ p_church_id: churchId, p_permission_granted: false });

  await page.getByRole("button", { name: "Edit and resubmit" }).click();
  await page.getByLabel("Rules").fill("No smoking; cleanup and key return are required.");
  const updated = page.waitForRequest((request) => request.url().includes("/church_listings") && request.method() === "PATCH");
  const permission = page.waitForRequest((request) => request.url().includes("/rpc/record_church_photo_permission") && request.method() === "POST" && request.postDataJSON().p_permission_granted === true);
  const submitted = page.waitForRequest((request) => request.url().includes("/rpc/submit_church_listing") && request.method() === "POST");
  await page.getByRole("button", { name: "Approve corrections and resubmit" }).click();
  const updatePayload = (await updated).postDataJSON();
  expect(updatePayload).not.toHaveProperty("owner_id");
  expect(updatePayload.rules).toContain("key return");
  expect((await permission).postDataJSON()).toMatchObject({ p_church_id: churchId, p_permission_granted: true });
  expect((await submitted).postDataJSON()).toEqual({ p_church_id: churchId });
});

test("staff sees the complete church proposal and permission evidence before approval", async ({ page }) => {
  await mockLogin(page, staffId, "staff@example.com");
  await page.route("**/rest/v1/church_listings**", (route) => route.fulfill({ json: [churchRow("pending")] }));
  await page.route("**/rest/v1/church_photo_permissions**", (route) => route.fulfill({ json: [{ church_id: churchId, permission_granted: true, permission_statement: "Authorized in writing for Yardly publication." }] }));
  await page.route("**/rest/v1/church_listing_reviews**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/church_event_requests**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: { user_id: staffId } }));
  await page.route("**/rest/v1/rpc/review_church_listing", (route) => route.fulfill({ json: { id: churchId, review_state: "approved" } }));

  await page.goto("/churches/");
  await page.getByRole("button", { name: "List a church space" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await login(page, "staff@example.com");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("A welcoming and flexible gathering hall for neighborhood events.")).toBeVisible();
  await expect(page.getByText("$150 per hour")).toBeVisible();
  await expect(page.getByText("No smoking; cleanup required.")).toBeVisible();
  await expect(page.getByText("Authorized in writing for Yardly publication.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Photo 1" })).toHaveAttribute("href", "https://example.com/hall.jpg");
  const reviewed = page.waitForRequest((request) => request.url().includes("/rpc/review_church_listing") && request.method() === "POST");
  await page.getByRole("button", { name: "Approve reviewed listing" }).click();
  expect((await reviewed).postDataJSON()).toEqual({ p_church_id: churchId, p_decision: "approved", p_review_note: "" });
});

test("community directory pauses stale official reservation links", async ({ page }) => {
  await page.route("**/rest/v1/community_spaces**", (route) => route.fulfill({ json: [communityRow(new Date().toISOString()), communityRow("2020-01-01T00:00:00Z", "stale-space", "Older Gym")] }));
  await page.goto("/community/");
  await expect(page.getByRole("link", { name: "Continue to official reservation process" })).toHaveCount(1);
  await expect(page.getByText("The official reservation link is paused")).toBeVisible();
  await expect(page.getByText("Recheck required")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("community corrections invalidate publication until a successful recheck", async ({ page }) => {
  let corrected = false;
  await mockLogin(page, staffId, "staff@example.com");
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: { user_id: staffId } }));
  await page.route("**/rest/v1/community_spaces**", (route) => route.fulfill({ json: [{ ...communityRow(new Date().toISOString()), is_published: !corrected, content_revision: corrected ? 2 : 1 }] }));
  await page.route("**/rest/v1/rpc/save_community_space", async (route) => { corrected = true; await route.fulfill({ json: { id: spaceId, content_revision: 2 } }); });
  await page.route("**/rest/v1/rpc/record_community_space_check", (route) => route.fulfill({ json: { id: spaceId } }));
  await page.route("**/rest/v1/rpc/set_community_space_published", (route) => route.fulfill({ json: { id: spaceId, is_published: true } }));

  await page.goto("/churches/");
  await page.getByRole("button", { name: "List a church space" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await login(page, "staff@example.com");
  await expect(page.getByRole("button", { name: "Review", exact: true })).toBeVisible();
  await page.goto("/community/");
  await page.getByRole("button", { name: "Manage directory" }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Published pricing").fill("$90 per hour");
  const saved = page.waitForRequest((request) => request.url().includes("/rpc/save_community_space") && request.method() === "POST");
  await page.getByRole("button", { name: "Save corrections and require recheck" }).click();
  expect((await saved).postDataJSON()).toMatchObject({ p_id: spaceId, p_published_pricing: "$90 per hour" });
  await expect(page.getByText("Corrections saved and publication invalidated.")).toBeVisible();
  await expect(page.getByText(/Unpublished/)).toBeVisible();

  const checked = page.waitForRequest((request) => request.url().includes("/rpc/record_community_space_check") && request.method() === "POST");
  const published = page.waitForRequest((request) => request.url().includes("/rpc/set_community_space_published") && request.method() === "POST");
  await page.getByRole("button", { name: "Still current" }).click();
  expect((await checked).postDataJSON()).toMatchObject({ p_space_id: spaceId, p_expected_revision: 2, p_source_status: "current" });
  expect((await published).postDataJSON()).toEqual({ p_space_id: spaceId, p_published: true });
});

function churchRow(reviewState = "approved") { return { id: churchId, owner_id: ownerId, church_name: "Community Church", space_name: "Fellowship Hall", location: "Washington, DC", description: "A welcoming and flexible gathering hall for neighborhood events.", capacity: 120, published_price: "$150 per hour", amenities: ["Kitchen", "Parking"], rules: "No smoking; cleanup required.", booking_contact_name: "Church office", photo_urls: ["https://example.com/hall.jpg"], photo_permission_granted: true, owner_approved_at: "2026-10-16T12:00:00Z", review_state: reviewState }; }
function communityRow(lastChecked: string, id = spaceId, name = "QA Recreation Center") { const fresh = !isCommunitySpaceStale(lastChecked); return { id, name, space_type: "recreation_center", location: "Washington, DC", capacity: 180, amenities: ["Gym", "Kitchen"], published_pricing: "$75 per hour", restrictions: "Permit and insurance may be required.", source_name: "District recreation department", last_checked_at: lastChecked, is_published: true, content_revision: 1, community_space_sources: fresh ? { official_url: "https://example.gov/center" } : null }; }
async function mockLogin(page: Page, id: string, email: string) { const user = { id, aud: "authenticated", role: "authenticated", email, user_metadata: { full_name: "Expansion QA" }, app_metadata: { provider: "email" } }; const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`; await page.unroute("**/auth/v1/**"); await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user })); }
async function login(page: Page, email: string) { await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", { exact: true }).fill("expansion-test-password"); await page.getByRole("button", { name: "Log in", exact: true }).click(); }
