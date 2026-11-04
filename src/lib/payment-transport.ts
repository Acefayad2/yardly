type NativeRequest = (options: {
  url: string; method: string; headers: Record<string, string>; data?: unknown;
  responseType: "json"; disableRedirects: boolean; connectTimeout: number; readTimeout: number;
}) => Promise<{ status: number; data: unknown }>;

export function nativePaymentOrigin(value: string | undefined) {
  const message = "Payments are not configured for this app build.";
  if (!value) throw new Error(message);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !/^(?:yardly-app|deploy-preview-\d+--yardly-app)\.netlify\.app$/.test(url.hostname)) {
    throw new Error(message);
  }
  return url.origin;
}

// Native requests use the HTTP bridge, not the local Capacitor web origin.
// Never follow redirects with the user's bearer token or retry a mutation here.
export async function sendPaymentRequest(path: string, token: string, body?: unknown,
  native?: { request: NativeRequest; origin: string | undefined }) {
  if (!/^(?:payment-checkout|payment-cancel|host-payments|payment-status(?:\?id=[a-zA-Z0-9%-]+)?)$/.test(path)) {
    throw new Error("Invalid payment endpoint.");
  }
  const method = body === undefined ? "GET" : "POST";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let status: number;
  let result: unknown;
  if (native) {
    const origin = nativePaymentOrigin(native.origin);
    const response = await native.request({
      url: `${origin}/.netlify/functions/${path}`, method,
      headers: { ...headers, Origin: origin },
      ...(body === undefined ? {} : { data: body }),
      responseType: "json", disableRedirects: true, connectTimeout: 15000, readTimeout: 30000,
    });
    status = response.status;
    result = response.data;
  } else {
    const response = await fetch(`/.netlify/functions/${path}`, {
      method, headers, redirect: "error",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    status = response.status;
    result = await response.json();
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Invalid payment response. Please retry.");
  }
  if (status < 200 || status >= 300) {
    const error = (result as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : "Payment request failed. Please retry.");
  }
  return result as Awaited<ReturnType<Response["json"]>>;
}
