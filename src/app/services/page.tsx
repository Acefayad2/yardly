import type { Metadata } from "next";
import ProviderMarketplace from "@/components/ProviderMarketplace";

export const metadata: Metadata = {
  title: "Event services and rentals — Yardly",
  description: "Find reviewed event professionals and equipment rental providers serving your area.",
};

export default function ServicesPage() {
  return <ProviderMarketplace />;
}
