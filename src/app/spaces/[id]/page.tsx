import { notFound } from "next/navigation";
import { SPACES, getSpace } from "@/lib/spaces";
import SpaceDetail from "@/components/SpaceDetail";

export function generateStaticParams() {
  return SPACES.map((s) => ({ id: s.id }));
}

export default async function SpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = getSpace(id);
  if (!space) notFound();
  return <SpaceDetail space={space} />;
}
