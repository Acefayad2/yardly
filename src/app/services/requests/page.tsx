import type { Metadata } from "next";
import ProviderRequests from "@/components/ProviderRequests";

export const metadata: Metadata = { title: "Provider requests — Yardly", description: "Request, review, and confirm separate provider quotes." };
export default function ProviderRequestsPage() { return <ProviderRequests />; }
