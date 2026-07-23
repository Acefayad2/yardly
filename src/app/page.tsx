import { Suspense } from "react";
import Explore from "@/components/Explore";

export default function Home() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading stays…</div>}>
      <Explore />
    </Suspense>
  );
}
