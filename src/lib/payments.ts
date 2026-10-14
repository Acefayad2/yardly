import { getSupabase } from "./supabase";
export const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_MODE === "sandbox";

export async function paymentRequest(path: string, body?: unknown) {
  const { data,error }=await getSupabase().auth.getSession();
  if(error || !data.session) throw new Error("Sign in to continue.");
  const response=await fetch(`/.netlify/functions/${path}`,{
    method:body === undefined ? "GET" : "POST",
    headers:{Authorization:`Bearer ${data.session.access_token}`,"Content-Type":"application/json"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  const result=await response.json();
  if(!response.ok) throw new Error(result.error ?? "Payment request failed. Please retry.");
  return result;
}

export function stripeRedirect(url: string) {
  const parsed=new URL(url);
  if(parsed.protocol !== "https:" || !(parsed.hostname === "checkout.stripe.com" || parsed.hostname === "connect.stripe.com" || parsed.hostname === "connect-js.stripe.com")) {
    throw new Error("Invalid payment destination.");
  }
  window.location.assign(parsed.href);
}
