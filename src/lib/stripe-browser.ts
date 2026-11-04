type PaymentBrowser = {
  open: (options: { url: string }) => Promise<void>;
  addListener: (event: "browserFinished", callback: () => void) => Promise<{ remove: () => Promise<void> }>;
};

export function stripeDestination(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["checkout.stripe.com", "connect.stripe.com", "connect-js.stripe.com"].includes(url.hostname)) {
    throw new Error("Invalid payment destination.");
  }
  return url.href;
}

// Closing Stripe is only a navigation event, never evidence of payment success.
export async function visitStripe(url: string, browser: PaymentBrowser) {
  const destination = stripeDestination(url);
  let finished: () => void = () => {};
  const closed = new Promise<void>(resolve => { finished = resolve; });
  const listener = await browser.addListener("browserFinished", finished);
  try {
    await browser.open({ url: destination });
    await closed;
  } finally {
    await listener.remove();
  }
}
