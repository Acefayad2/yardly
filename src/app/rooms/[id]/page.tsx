import { notFound } from "next/navigation";
import { LISTINGS, getListing } from "@/lib/listings";
import RoomDetail from "@/components/RoomDetail";

export function generateStaticParams() {
  return LISTINGS.map((l) => ({ id: l.id }));
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) notFound();
  return <RoomDetail listing={listing} />;
}
