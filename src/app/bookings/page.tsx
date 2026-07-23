import { Suspense } from "react";
import Bookings from "@/components/Bookings";

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading…</div>}>
      <Bookings />
    </Suspense>
  );
}
