import { getSupabase } from "./supabase";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { sendPaymentRequest } from "./payment-transport";
import { Browser } from "@capacitor/browser";
import { stripeDestination, visitStripe } from "./stripe-browser";
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

export async function stripeRedirect(url: string) {
  if (Capacitor.isNativePlatform()) {
    await visitStripe(url, Browser);
    return true;
  }
  window.location.assign(stripeDestination(url));
  return false;
}
