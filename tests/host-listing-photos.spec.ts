import { test, expect } from "@playwright/test";

// Mocked UI regression only. Live authorization and the images column are exercised by
// the SQL rollback suites.
test("a host can delete and reorder photos before creating a listing, with real upload progress", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { full_name: "QA Host" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  const uploadedPaths: string[] = [];
  let insertedImages: string[] | null = null;

  await page.route("**/auth/v1/**", (route) => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 3600, user } : user }));

  await page.route("https://photon.komoot.io/api/**", (route) => route.fulfill({
    json: {
      features: [{
        geometry: { coordinates: [-118, 34] },
        properties: { housenumber: "1", street: "QA Fixture Way", city: "Test City", state: "TS", postcode: "00000", country: "USA", district: "Test Area" },
      }],
    },
  }));

  await page.route("**/storage/v1/object/listing-images/**", async (route) => {
    // Uploads happen sequentially, awaited one at a time (never in parallel) -- this
    // delay only needs to keep upload 2 from being *sent* before the assertion below
    // has a chance to observe the state after upload 1's response lands.
    await new Promise((resolve) => setTimeout(resolve, 150));
    uploadedPaths.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { Id: "test", Key: "test" } });
  });

  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/profiles") && request.method() === "POST") {
      return route.fulfill({ json: { account_type: "both" } });
    }
    if (path.endsWith("/listing_addresses")) {
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/listings") && request.method() === "POST") {
      insertedImages = request.postDataJSON().images;
      return route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000060", title: "QA photo order listing", location: "Test City, TS",
          neighborhood: "Test Area", timezone: "America/New_York", space_type: "Backyards", hourly_price: 45,
          min_hours: 2, capacity: 12, description: "A temporary fixture used only for this Playwright run.",
          amenities: [], rules: [], latitude: 34, longitude: -118, images: insertedImages, status: "draft",
          created_at: "2026-01-01T00:00:00Z", host_display_name: "QA Host", host_avatar_url: null,
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("qa@example.com");
  await page.getByLabel("Password", { exact: true }).fill("qa-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();

  await page.goto("/host/listings/new/");

  // Step 1: add three photos, then delete the middle one and reorder the remaining two.
  const fixture = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from(`fixture-${name}`) });
  await page.locator('input[type="file"]').setInputFiles([fixture("alpha.jpg"), fixture("beta.jpg"), fixture("gamma.jpg")]);
  await expect(page.getByAltText("Cover photo")).toBeVisible();
  await expect(page.getByAltText("Photo 2")).toBeVisible();
  await expect(page.getByAltText("Photo 3")).toBeVisible();

  await page.getByRole("button", { name: "Remove photo 2", exact: true }).click();
  await expect(page.getByAltText("Photo 3")).toHaveCount(0);
  await expect(page.getByAltText("Cover photo")).toBeVisible();
  await expect(page.getByAltText("Photo 2")).toBeVisible();

  await page.getByRole("button", { name: "Move photo 1 later", exact: true }).click();
  // gamma (originally third) is now the cover; alpha (originally first) is now second.

  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Step 2: minimum required fields, then pick the geocoded suggestion.
  await page.getByLabel("Listing title").fill("QA photo order listing");
  await page.getByRole("combobox", { name: "Property address" }).fill("1 QA Fixture Way");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.getByRole("option").first().click();
  await page.getByLabel(/Description/).fill("A temporary fixture used only for this Playwright run.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Step 3: rules is required; submit and confirm the intermediate progress text renders.
  // Wait on the actual first-upload response, not a fixed delay -- a timing race against
  // a setTimeout window is exactly the kind of flake that fails only under CI-level load.
  await page.getByLabel("Space rules").fill("No smoking");
  const firstUploadResponse = page.waitForResponse((response) => response.url().includes("/storage/v1/object/listing-images/"));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await firstUploadResponse;
  await expect(page.getByRole("button", { name: "Uploading photo 1 of 2…", exact: true })).toBeVisible();

  await expect(page).toHaveURL(/\/host\/listings\/?\?created=1/);
  expect(uploadedPaths).toHaveLength(2);
  expect(uploadedPaths[0]).toMatch(/gamma\.jpg$/);
  expect(uploadedPaths[1]).toMatch(/alpha\.jpg$/);
  expect(insertedImages).toHaveLength(2);
  expect(insertedImages![0]).toContain("gamma.jpg");
  expect(insertedImages![1]).toContain("alpha.jpg");
});
