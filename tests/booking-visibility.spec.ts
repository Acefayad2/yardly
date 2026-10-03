import { test, expect, type Page } from "@playwright/test";

const guestId = "00000000-0000-4000-8000-000000000001";
const hostId = "00000000-0000-4000-8000-000000000002";
const otherGuestId = "00000000-0000-4000-8000-000000000003";
const listingId = "00000000-0000-4000-8000-000000000011";
const threadId = "00000000-0000-4000-8000-000000000021";
const otherThreadId = "00000000-0000-4000-8000-000000000022";
const bookingId = "00000000-0000-4000-8000-000000000031";
const listing = {
  id: listingId, host_id: hostId, title: "Saved booking yard", location: "Fixture City, NY",
  neighborhood: "Fixture neighborhood", timezone: "America/New_York", space_type: "Backyards",
  hourly_price: 50, day_price: 300, min_hours: 1, capacity: 8, description: "A fixture yard used only in browser tests.",
  amenities: [], rules: [], images: ["https://example.com/yard.jpg"], latitude: 40, longitude: -74,
  status: "published", host_display_name: "Fixture Host", created_at: "2026-01-01T00:00:00Z",
};
const reservation = {
  id: bookingId, guest_id: guestId, listing_id: listingId, listing_title: listing.title,
  listing_location: listing.location, listing_image: listing.images[0], listing_timezone: listing.timezone,
  start_at: "2090-01-01T15:00:00Z", end_at: "2090-01-01T17:00:00Z", guests: 2, total: 112,
  host_payout: 100, status: "confirmed", created_at: "2026-01-01T00:00:00Z", listings: { host_id: hostId },
};

async function setup(page: Page, options: { hosting?: boolean; status?: string; hasThread?: boolean; extraTrips?: boolean; secondThread?: boolean; failCreate?: boolean } = {}) {
  const userId = options.hosting ? hostId : guestId;
  let status = options.status ?? "paused";
  let hasThread = options.hasThread ?? true;
  let createAttempts = 0;
  const sent: { conversation_id: string; sender_id: string; body: string }[] = [];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.com", user_metadata: { full_name: "Fixture User" }, app_metadata: { provider: "email" } };
  const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/auth/v1/**", route => route.fulfill({ json: route.request().url().includes("/token") ? { access_token: jwt, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user } : user }));
  await page.route("**/rest/v1/listings?**", route => {
    const url = new URL(route.request().url());
    const hostQuery = url.searchParams.has("host_id");
    if (route.request().method() === "PATCH") {
      status = route.request().postDataJSON().status;
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: status === "published" || hostQuery && options.hosting ? [{ ...listing, status }] : [] });
  });
  await page.route("**/rest/v1/reservations?**", route => {
    const hostQuery = new URL(route.request().url()).searchParams.has("listings.host_id");
    if (hostQuery !== !!options.hosting) return route.fulfill({ json: [] });
    const rows = options.extraTrips ? Array.from({ length: 4 }, (_, i) => ({ ...reservation, id: `${bookingId.slice(0, -1)}${i + 1}`, listing_title: `Saved trip ${i + 1}` })) : [reservation];
    return route.fulfill({ json: rows });
  });
  await page.route("**/rest/v1/listing_addresses?**", route => route.fulfill({ json: [{ listing_id: listingId, street_address: "1 Fixture Street" }] }));
  await page.route("**/rest/v1/conversations?**", async route => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get("select") ?? "";
    if (route.request().method() === "POST") {
      createAttempts++;
      expect(route.request().postDataJSON()).toEqual({ listing_id: listingId, guest_id: guestId, host_id: hostId });
      if (options.failCreate) return route.fulfill({ status: 403, json: { message: "Conversation is not available" } });
      hasThread = true;
      return route.fulfill({ json: { id: threadId } });
    }
    if (select === "id") return route.fulfill({ json: hasThread ? { id: threadId } : null });
    // Model the actual RLS + PostgREST join failure: the old inner embed loses the row.
    if (!hasThread || !options.hosting && status !== "published" && select.includes("!inner")) return route.fulfill({ json: [] });
    expect(select).not.toContain("!inner");
    const row = { id: threadId, listing_id: listingId, guest_id: guestId, host_id: hostId, updated_at: "2026-01-02T00:00:00Z", listings: options.hosting || status === "published" ? { title: listing.title, images: listing.images, status } : null };
    return route.fulfill({ json: options.secondThread ? [{ ...row, id: otherThreadId, guest_id: options.hosting ? otherGuestId : guestId, listing_id: options.hosting ? listingId : "00000000-0000-4000-8000-000000000012", listings: { title: "Other yard", images: [], status: "published" } }, row] : [row] });
  });
  await page.route("**/rest/v1/messages?**", route => route.fulfill({ json: [
    { id: "message-1", conversation_id: threadId, sender_id: hostId, body: "Your visit is still confirmed", created_at: "2026-01-02T00:00:00Z" },
    ...sent.map((message, index) => ({ ...message, id: `sent-${index}`, created_at: "2026-01-02T01:00:00Z" })),
  ] }));
  await page.route("**/rest/v1/messages", route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.goto("/profile/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("fixture@example.com");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal details" })).toBeVisible();
  return { sent, createAttempts: () => createAttempts };
}

for (const status of ["paused", "archived"]) {
  test(`${status} listing keeps guest trip, booking snapshot and existing conversation usable`, async ({ page }, testInfo) => {
    const state = await setup(page, { status });
    await page.goto("/trips/");
    await expect(page.getByRole("link", { name: /Saved booking yard/ })).toBeVisible();
    await expect(page.getByText("📍 1 Fixture Street")).toBeVisible();
    await page.getByRole("link", { name: /Saved booking yard/ }).click();
    await expect(page).toHaveURL(new RegExp(`booking=${bookingId}`));
    await expect(page.getByText("Listing is not currently available.", { exact: false })).toBeVisible();
    await expect(page.locator(`a[href*="spaces?id=${listingId}"]`)).toHaveCount(0);
    await page.getByRole("link", { name: "Message host", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`conversation=${threadId}`));
    await expect(page.getByText("Your visit is still confirmed", { exact: true }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "View space", exact: true })).toHaveCount(0);
    await page.getByLabel("Message", { exact: true }).fill("Thank you for confirming");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    expect(state.sent).toEqual([{ conversation_id: threadId, sender_id: guestId, body: "Thank you for confirming" }]);
    expect(state.createAttempts()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`guest-${status}-conversation.png`) });
  });
}

test("all confirmed trips remain visible without published listing coordinates", async ({ page }) => {
  await setup(page, { extraTrips: true });
  await page.goto("/trips/");
  await expect(page.locator(".trip-card")).toHaveCount(4);
  await expect(page.getByText("No upcoming trips", { exact: true })).toHaveCount(0);
});

test("guest can create a published-listing conversation from the booking", async ({ page }) => {
  const state = await setup(page, { status: "published", hasThread: false });
  await page.goto("/bookings/");
  await page.getByRole("button", { name: "Message host", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${threadId}`));
  await expect(page.getByRole("link", { name: "View space", exact: true })).toBeVisible();
  expect(state.createAttempts()).toBe(1);
});

test("guest contact errors preserve the booking and unavailable listings do not create threads", async ({ page }) => {
  const state = await setup(page, { status: "published", hasThread: false, failCreate: true });
  await page.goto("/bookings/");
  await page.getByRole("button", { name: "Message host", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Conversation is not available" })).toBeVisible();
  await expect(page.getByText(listing.title, { exact: true })).toBeVisible();
  expect(state.createAttempts()).toBe(1);
});

test("missing conversations remain explicit without unauthorized contact creation", async ({ page }) => {
  const state = await setup(page, { hasThread: false });
  await page.goto("/bookings/");
  await expect(page.getByText("No conversation yet. A new conversation can be started when the listing is published again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Message host", exact: true })).toHaveCount(0);
  expect(state.createAttempts()).toBe(0);
});

test("host opens only the booked guest's existing thread", async ({ page }) => {
  const state = await setup(page, { hosting: true, secondThread: true });
  await page.goto("/host/reservations/");
  await page.getByRole("link", { name: "Message guest", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${threadId}`));
  await expect(page.getByRole("heading", { name: listing.title, exact: true })).toBeVisible();
  expect(state.createAttempts()).toBe(0);
});

test("host cannot initiate a missing guest thread", async ({ page }) => {
  const state = await setup(page, { hosting: true, hasThread: false, status: "published" });
  await page.goto("/host/reservations/");
  await expect(page.getByText(/No conversation yet. Your guest can message you/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Message guest", exact: true })).toHaveCount(0);
  expect(state.createAttempts()).toBe(0);
});

test("inbox deep links, Back and per-recipient drafts cannot switch a reply's recipient", async ({ page }) => {
  const state = await setup(page, { secondThread: true });
  await page.goto(`/messages/?conversation=${threadId}`);
  await page.getByLabel("Message", { exact: true }).fill("Draft for my booking");
  await page.getByRole("link", { name: /Other yard/ }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${otherThreadId}`));
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await page.getByLabel("Message", { exact: true }).fill("Other draft");
  await page.goBack();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Draft for my booking");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  expect(state.sent[0].conversation_id).toBe(threadId);
  await page.goto("/messages/?conversation=unavailable-thread");
  await expect(page.getByText(/This conversation is not available for this account/)).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
});

for (const status of ["paused", "archived"]) {
  test(`host ${status} transition refreshes contact availability in the same session`, async ({ page }) => {
    await setup(page, { hosting: true, status: "published" });
    await page.goto("/host/listings/");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByText("paused", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toHaveCount(0);
    if (status === "archived") {
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await page.getByRole("button", { name: "Confirm archive", exact: true }).click();
      await expect(page.getByText("archived", { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Saving…" })).toHaveCount(0);
    }
    await page.getByRole("navigation", { name: "Host navigation" }).getByRole("link", { name: "Reservations", exact: true }).click();
    await page.getByRole("link", { name: "Message guest", exact: true }).click();
    await expect(page.getByText("The listing is not currently available. Your conversation is still open.")).toBeVisible();
    await expect(page.getByRole("link", { name: "View space", exact: true })).toHaveCount(0);
  });
}
