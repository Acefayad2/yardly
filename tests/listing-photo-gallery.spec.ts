import { expect, test, type Page } from "@playwright/test";

const image = (index: number) => `https://images.example.test/listing-${index}.svg`;

function listing(images: string[]) {
  return {
    id: "gallery-fixture",
    host_id: "gallery-host",
    title: "Gallery fixture yard",
    location: "Test City, TS",
    neighborhood: "Fixture Park",
    timezone: "America/New_York",
    space_type: "Backyards",
    hourly_price: 42,
    day_price: 0,
    min_hours: 2,
    capacity: 10,
    description: "A synthetic listing used only by the browser regression suite.",
    amenities: ["Seating"],
    rules: ["Be kind"],
    images,
    latitude: 34,
    longitude: -118,
    status: "published",
    host_display_name: "QA Host",
    host_avatar_url: image(99),
    created_at: "2026-01-01T00:00:00Z",
  };
}

async function mockListing(page: Page, images: string[]) {
  await page.route("**/rest/v1/listings**", (route) => route.fulfill({ json: [listing(images)] }));
  await page.route("https://images.example.test/*.svg", (route) => {
    const match = route.request().url().match(/listing-(\d+)\.svg/);
    const number = Number(match?.[1] ?? 0);
    if (number === 4) return route.fulfill({ status: 404, body: "missing" });
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${number * 35} 45% 55%)"/></svg>`,
    });
  });
}

test("all uploaded photos are reachable with keyboard navigation and broken-image recovery", async ({ page, isMobile }) => {
  await mockListing(page, Array.from({ length: 8 }, (_, index) => image(index + 1)));
  await page.goto("/spaces/?id=gallery-fixture");

  const showAll = page.getByRole("button", { name: "Show all 8 photos" }).last();
  await expect(showAll).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("button", { name: "View photo 1" })).toBeHidden();
  } else {
    await expect(page.getByRole("button", { name: "View photo 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View photo 6" })).toBeHidden();
  }

  await showAll.click();
  const dialog = page.getByRole("dialog", { name: "Gallery fixture yard" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Photo 1 of 8")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Photo 2 of 8")).toBeVisible();
  await page.keyboard.press("End");
  await expect(dialog.getByText("Photo 8 of 8")).toBeVisible();
  await dialog.getByRole("button", { name: "View photo 4" }).click();
  await expect(dialog.getByText("Photo 4 of 8")).toBeVisible();
  await expect(dialog.getByRole("img", { name: /photo 4 of 8\. Image unavailable/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(showAll).toBeFocused();

  await showAll.click();
  await dialog.getByRole("button", { name: "Close photo gallery" }).click();
  await expect(dialog).toBeHidden();
});

test("a single listing photo opens without irrelevant navigation controls", async ({ page }) => {
  await mockListing(page, [image(1)]);
  await page.goto("/spaces/?id=gallery-fixture");

  const viewPhoto = page.getByRole("button", { name: "View photo", exact: true }).last();
  await expect(viewPhoto).toBeVisible();
  await viewPhoto.click();
  const dialog = page.getByRole("dialog", { name: "Gallery fixture yard" });
  await expect(dialog.getByText("Photo 1 of 1")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Previous photo" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Next photo" })).toHaveCount(0);
});

test("a published record without photos is not exposed as a bookable detail page", async ({ page }) => {
  await mockListing(page, []);
  await page.goto("/spaces/?id=gallery-fixture");
  await expect(page.getByRole("heading", { name: "This space is not available" })).toBeVisible();
  await expect(page.getByRole("button", { name: /photo/i })).toHaveCount(0);
});
