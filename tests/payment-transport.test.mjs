import { test } from "node:test";
import assert from "node:assert/strict";
import { nativePaymentOrigin, sendPaymentRequest } from "../src/lib/payment-transport.ts";

const origin = "https://deploy-preview-42--yardly-app.netlify.app";
test("native payments require an explicit trusted HTTPS origin", () => {
  for (const value of [undefined, "", "http://yardly-app.netlify.app", "https://evil.example",
    `${origin}/path`, `${origin}?x=1`, `${origin}#x`, `${origin}:444`,
    "https://name:password@yardly-app.netlify.app", "https://yardly-app.netlify.app.evil.example"]) {
    assert.throws(() => nativePaymentOrigin(value));
  }
  assert.equal(nativePaymentOrigin(`${origin}/`), origin);
  assert.equal(nativePaymentOrigin("https://yardly-app.netlify.app"), "https://yardly-app.netlify.app");
});
test("native checkout uses HTTPS bearer auth, matching origin and no redirects", async () => {
  const calls = [];
  const body = { requestId: "stable-request" };
  const result = await sendPaymentRequest("payment-checkout", "test-token", body, {
    origin, request: async options => { calls.push(options); return { status: 200, data: { id: "order" } }; },
  });
  assert.deepEqual(result, { id: "order" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${origin}/.netlify/functions/payment-checkout`);
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
  assert.equal(calls[0].headers.Origin, origin);
  assert.equal(calls[0].disableRedirects, true);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].data, body);
});
test("native GET preserves order query and omits request body", async () => {
  await sendPaymentRequest("payment-status?id=order-1", "test-token", undefined, {
    origin, request: async options => {
      assert.equal(options.method, "GET");
      assert.equal(options.url, `${origin}/.netlify/functions/payment-status?id=order-1`);
      assert.equal("data" in options, false);
      return { status: 200, data: { state: "paid" } };
    },
  });
});
test("unsafe paths or missing native config never send a token", async () => {
  let calls = 0;
  const request = async () => { calls++; return { status: 200, data: {} }; };
  for (const path of ["https://evil.example", "../payment-checkout", "payment-status?id=x&redirect=evil"]) {
    await assert.rejects(sendPaymentRequest(path, "token", undefined, { origin, request }));
  }
  await assert.rejects(sendPaymentRequest("host-payments", "token", undefined, { request }));
  assert.equal(calls, 0);
});
test("native failures and redirects never look successful or automatically retry", async () => {
  for (const response of [{ status: 302, data: {} }, { status: 409, data: { error: "Slot unavailable" } },
    { status: 200, data: "<html>error</html>" }, { status: 200, data: null }]) {
    let calls = 0;
    await assert.rejects(sendPaymentRequest("payment-checkout", "token", {}, {
      origin, request: async () => { calls++; return response; },
    }));
    assert.equal(calls, 1);
  }
});
test("web requests remain same-origin and reject redirects", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/.netlify/functions/payment-cancel");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer token");
    assert.equal("Origin" in options.headers, false);
    assert.equal(options.body, JSON.stringify({ id: "order" }));
    return Response.json({ state: "refunded" });
  });
  assert.deepEqual(await sendPaymentRequest("payment-cancel", "token", { id: "order" }), { state: "refunded" });
});
