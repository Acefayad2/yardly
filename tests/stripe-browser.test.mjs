import { test } from "node:test";
import assert from "node:assert/strict";
import { stripeDestination, visitStripe } from "../src/lib/stripe-browser.ts";

test("Stripe browser accepts only HTTPS Stripe destinations without credentials", () => {
  for (const host of ["checkout.stripe.com", "connect.stripe.com", "connect-js.stripe.com"]) {
    assert.equal(stripeDestination(`https://${host}/test`), `https://${host}/test`);
  }
  for (const url of ["https://evil.example", "http://checkout.stripe.com", "https://checkout.stripe.com.evil.example",
    "https://name:password@checkout.stripe.com", "https://checkout.stripe.com:444", "javascript:alert(1)"]) {
    assert.throws(() => stripeDestination(url));
  }
});
test("native checkout waits for Done and removes its listener", async () => {
  let close;
  let opened = false;
  let removed = 0;
  let returned = false;
  const visit = visitStripe("https://checkout.stripe.com/test", {
    addListener: async (event, callback) => {
      assert.equal(event, "browserFinished");
      close = callback;
      return { remove: async () => { removed++; } };
    },
    open: async ({ url }) => { assert.equal(url, "https://checkout.stripe.com/test"); opened = true; },
  }).then(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened, true);
  assert.equal(returned, false);
  close();
  await visit;
  assert.equal(returned, true);
  assert.equal(removed, 1);
});
test("browser opening failure propagates and cleans up without claiming success", async () => {
  let removed = 0;
  await assert.rejects(visitStripe("https://connect.stripe.com/test", {
    addListener: async () => ({ remove: async () => { removed++; } }),
    open: async () => { throw new Error("Cannot open browser"); },
  }), /Cannot open browser/);
  assert.equal(removed, 1);
});
test("unsafe destination never registers listeners or opens the browser", async () => {
  let calls = 0;
  await assert.rejects(visitStripe("https://evil.example", {
    addListener: async () => { calls++; }, open: async () => { calls++; },
  }));
  assert.equal(calls, 0);
});
