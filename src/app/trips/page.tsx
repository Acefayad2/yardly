import { Suspense } from "react";
import Trips from "@/components/Trips";

export default function TripsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading…</div>}>
      <Trips />
    </Suspense>
  );
}
