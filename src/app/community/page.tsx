import ExpansionNotice from "@/components/ExpansionNotice";
import type { Metadata } from "next";
import CommunityDirectory from "@/components/CommunityDirectory";

export const metadata: Metadata = { title: "Community spaces — Yardly", description: "Browse curated community spaces with official sources and visible freshness checks." };
export default function CommunityPage() { return <><ExpansionNotice /><CommunityDirectory /></>; }
