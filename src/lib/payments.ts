import { getSupabase } from "./supabase";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { sendPaymentRequest } from "./payment-transport";
export const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_MODE === "sandbox";

export async function paymentRequest(path: string, body?: unknown) {
  const { data,error }=await getSupabase().auth.getSession();
  if(error || !data.session) throw new Error("Sign in to continue.");
  return sendPaymentRequest(path, data.session.access_token, body,
    Capacitor.isNativePlatform() ? {
      request: options => CapacitorHttp.request(options),
      origin: process.env.NEXT_PUBLIC_PAYMENTS_API_ORIGIN,
    } : undefined);
}

export function stripeRedirect(url: string) {
  const parsed=new URL(url);
  if(parsed.protocol !== "https:" || !(parsed.hostname === "checkout.stripe.com" || parsed.hostname === "connect.stripe.com" || parsed.hostname === "connect-js.stripe.com")) {
    throw new Error("Invalid payment destination.");
  }
  window.location.assign(parsed.href);
}
