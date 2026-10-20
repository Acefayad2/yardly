import type { Metadata } from "next";
import ChurchDirectory from "@/components/ChurchDirectory";

export const metadata: Metadata = { title: "Church spaces — Yardly", description: "Find church-approved gathering spaces and send a separate event request." };
export default function ChurchesPage() { return <ChurchDirectory />; }
