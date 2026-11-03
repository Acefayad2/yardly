"use client";

import Link from "next/link";
import HostSignInRequired from "@/components/HostSignInRequired";
import StaffPaymentReview from "@/components/StaffPaymentReview";
import { useStore } from "@/lib/store";
import { paymentsEnabled } from "@/lib/payments";

export default function StaffPaymentsPage() {
  const { user } = useStore();
  if (!user) return <HostSignInRequired />;

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-semibold text-brand-dark">Payment review</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Refunds and disputes</h1>
        {paymentsEnabled ? (
          <div className="mt-6"><StaffPaymentReview /></div>
        ) : (
          <p className="mt-6 rounded-2xl border border-border-soft bg-white p-6 text-sm text-muted">
            Payments are switched off in this build, so there is nothing to review here.
          </p>
        )}
        <Link href="/" className="mt-8 inline-flex text-sm font-semibold text-brand-dark">Back to Yardly</Link>
      </div>
    </div>
  );
}
