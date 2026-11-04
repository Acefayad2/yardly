import { expect, test } from "@playwright/test";
import { mapProviderProfile, validateProviderDraft, type ProviderProfileDraft } from "../src/lib/provider-marketplace";
import { validateProviderPhoto } from "../src/lib/provider-photos";

test("provider photo validation rejects empty, oversized, and active formats", () => {
  expect(validateProviderPhoto({ type: "image/jpeg", size: 1024 })).toBeNull();
  expect(validateProviderPhoto({ type: "image/svg+xml", size: 1024 })).toContain("JPEG");
  expect(validateProviderPhoto({ type: "image/png", size: 0 })).toContain("5 MB");
  expect(validateProviderPhoto({ type: "image/webp", size: 5242881 })).toContain("5 MB");
});

const validDraft: ProviderProfileDraft = {
  kind: "service",
  businessName: "Capital Event Photo",
  category: "Photography",
  serviceArea: "Washington, DC and nearby Maryland",
  summary: "Documentary event photography with edited digital galleries and clear delivery expectations.",
  offerings: ["Two-hour coverage"],
  startingPrice: 325,
  sampleUrls: ["https://example.com/sample.jpg"],
  deliveryDetails: "",
  setupDetails: "",
  pickupDetails: "",
  inventory: [],
};

test("provider validation requires reviewed-profile fields and rental quantities", () => {
  expect(validateProviderDraft(validDraft)).toEqual([]);
  expect(validateProviderDraft({ ...validDraft, sampleUrls: ["http://example.com/sample.jpg"] })).toContain("Work samples must use valid HTTPS URLs.");
  expect(validateProviderDraft({ ...validDraft, kind: "equipment" })).toEqual(expect.arrayContaining([
    "Add equipment with a whole-number available quantity.",
    "Describe delivery, setup, and pickup for equipment rentals.",
  ]));
});

test("provider rows map equipment quantities and fulfillment details", () => {
  const profile = mapProviderProfile({
    id: "provider-1", owner_id: "owner-1", kind: "equipment", business_name: "Gather Rentals", category: "Tables and chairs",
    service_area: "DMV", summary: "Reliable equipment rentals for local events and community gatherings.", offerings: ["Chair rental"],
    starting_price: "4.50", sample_urls: ["https://example.com/chair.jpg"], delivery_details: "Quoted by distance", setup_details: "Available by quote",
    pickup_details: "Agreed pickup window", review_state: "approved", provider_inventory_items: [{ id: "item-1", name: "Folding chair", quantity_available: 80 }],
  });
  expect(profile.startingPrice).toBe(4.5);
  expect(profile.inventory).toEqual([{ id: "item-1", name: "Folding chair", quantityAvailable: 80 }]);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/v1/**", (route) => route.fulfill({ status: 400, json: { message: "No test session" } }));
  await page.route("**/rest/v1/listings**", (route) => route.fulfill({ json: [] }));
});

test("public services page renders only reviewed provider data", async ({ page }) => {
  await page.route("**/rest/v1/provider_profiles**", (route) => route.fulfill({ json: [{
    id: "provider-1", owner_id: "owner-1", kind: "equipment", business_name: "Gather Rentals", category: "Tables and chairs",
    service_area: "Washington, DC", summary: "Reviewed equipment rentals for celebrations, nonprofit events, and neighborhood gatherings.",
    offerings: ["Chair rental", "Table rental"], starting_price: 4.5, sample_urls: ["https://example.com/chair.jpg"],
    delivery_details: "Quoted by distance", setup_details: "Available as a separate quote", pickup_details: "Scheduled with the provider",
    review_state: "approved", review_note: "", submitted_at: "2026-10-15T12:00:00Z", reviewed_at: "2026-10-16T12:00:00Z",
    provider_inventory_items: [{ id: "item-1", name: "Folding chair", quantity_available: 80 }],
  }] }));
  await page.goto("/services/");
  await expect(page.getByRole("heading", { name: "Bring the whole event together." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gather Rentals" })).toBeVisible();
  await expect(page.getByText("Folding chair (80)")).toBeVisible();
  await expect(page.getByText("Request a separate quote")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("services page has honest empty and backend error states", async ({ page }) => {
  await page.route("**/rest/v1/provider_profiles**", (route) => route.fulfill({ json: [] }));
  await page.goto("/services/");
  await expect(page.getByRole("heading", { name: "No reviewed providers yet" })).toBeVisible();
  await page.getByRole("button", { name: "List your business" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to list a business" })).toBeVisible();

  await page.unroute("**/rest/v1/provider_profiles**");
  await page.route("**/rest/v1/provider_profiles**", (route) => route.fulfill({ status: 500, json: { message: "Review service unavailable" } }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Review service unavailable" })).toBeVisible();
});

test("signed-in provider can submit a complete photography profile for review", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000031", aud: "authenticated", role: "authenticated", email: "provider@example.com", user_metadata: { full_name: "Provider QA" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.unroute("**/auth/v1/**");
  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().url().includes("/token")) await route.fulfill({ json: { access_token: jwt, refresh_token: "provider-refresh", token_type: "bearer", expires_in: 3600, user } });
    else await route.fulfill({ json: user });
  });
  await page.route("**/rest/v1/provider_profiles**", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ json: { id: "00000000-0000-4000-8000-000000000041" } });
    else await route.fulfill({ json: [] });
  });
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/provider_profile_reviews**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/profiles**", (route) => route.fulfill({ json: { account_type: "guest" } }));
  await page.route("**/rest/v1/saved_listings**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/reservations**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/conversations**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/rpc/complete_past_reservations**", (route) => route.fulfill({ json: [] }));
  const submitted = page.waitForRequest((request) => request.url().includes("/rest/v1/rpc/submit_provider_profile") && request.method() === "POST");
  await page.route("**/rest/v1/rpc/submit_provider_profile", (route) => route.fulfill({ json: { id: "00000000-0000-4000-8000-000000000041", review_state: "pending" } }));

  await page.goto("/services/");
  await page.getByRole("button", { name: "List your business" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("provider@example.com");
  await page.getByLabel("Password", { exact: true }).fill("provider-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "List your business" })).toBeVisible();
  await page.getByLabel("Business name").fill("Capital Event Photo");
  await page.getByLabel("Service area").fill("Washington, DC and nearby Maryland");
  await page.getByLabel("About the business").fill("Documentary event photography with edited digital galleries and clear delivery expectations.");
  await page.getByLabel("Offerings (comma separated)").fill("Two-hour coverage, Edited digital gallery");
  await page.getByLabel("Starting price (USD)").fill("325");
  let uploadPath = "";
  await page.route("**/storage/v1/object/provider-work-samples/**", (route) => {
    uploadPath = route.request().url();
    return route.fulfill({ json: { Key: "provider-work-samples/photo.png" } });
  });
  await page.route("**/storage/v1/object/sign/provider-work-samples/**", (route) => route.fulfill({ json: { signedURL: "/object/sign/provider-work-samples/photo.png?token=test" } }));
  await page.getByLabel("Upload work-sample photos").setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") });
  await expect(page.getByRole("status").filter({ hasText: "Photos uploaded privately" })).toBeVisible();
  expect(uploadPath).toContain(`/provider-work-samples/${user.id}/`);
  await expect(page.getByLabel("HTTPS work-sample URLs (one per line)")).toHaveValue(/\/object\/authenticated\/provider-work-samples\//);
  await page.getByRole("button", { name: "Submit for review" }).click();
  expect((await submitted).postDataJSON().p_profile_id).toBe("00000000-0000-4000-8000-000000000041");
  await expect(page.getByRole("status").filter({ hasText: "submitted for staff review" })).toBeVisible();
});

test("editing an existing rejected provider never sends owner_id", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000031", aud: "authenticated", role: "authenticated", email: "provider@example.com", user_metadata: { full_name: "Provider QA" }, app_metadata: { provider: "email" } };
  const profileId = "00000000-0000-4000-8000-000000000041";
  const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.unroute("**/auth/v1/**");
  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "provider-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/provider_profiles**", (route) => {
    if (route.request().method() === "PATCH") return route.fulfill({ json: { id: profileId } });
    const ownerQuery = new URL(route.request().url()).searchParams.has("owner_id");
    return route.fulfill({ json: ownerQuery ? {
      id: profileId, owner_id: user.id, kind: "service", business_name: "Capital Event Photo", category: "Photography",
      service_area: "Washington, DC and nearby Maryland", summary: "Documentary event photography with edited digital galleries and clear delivery expectations.",
      offerings: ["Two-hour coverage"], starting_price: 325, sample_urls: ["https://example.com/sample.jpg"], delivery_details: "", setup_details: "", pickup_details: "",
      review_state: "rejected", submitted_at: "2026-10-15T12:00:00Z", reviewed_at: "2026-10-16T12:00:00Z", provider_inventory_items: [],
    } : [] });
  });
  await page.route("**/rest/v1/marketplace_staff**", (route) => route.fulfill({ json: null }));
  await page.route("**/rest/v1/provider_profile_reviews**", (route) => route.fulfill({ json: { review_note: "Clarify gallery delivery." } }));
  await page.route("**/rest/v1/profiles**", (route) => route.fulfill({ json: { account_type: "guest" } }));
  await page.route("**/rest/v1/saved_listings**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/reservations**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/conversations**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/rpc/complete_past_reservations**", (route) => route.fulfill({ json: [] }));

  await page.goto("/services/");
  await page.getByRole("button", { name: "List your business" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("provider@example.com");
  await page.getByLabel("Password", { exact: true }).fill("provider-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Update your submission" })).toBeVisible();
  await page.getByLabel("About the business").fill("Corrected documentary event photography with a ten-business-day edited gallery delivery commitment.");
  const updated = page.waitForRequest((request) => request.url().includes("/provider_profiles") && request.method() === "PATCH");
  await page.getByRole("button", { name: "Save private draft" }).click();
  const payload = (await updated).postDataJSON();
  expect(payload).not.toHaveProperty("owner_id");
  expect(payload.summary).toContain("ten-business-day");
});
