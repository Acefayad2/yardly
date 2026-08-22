import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SPACES, getSpace } from "@/lib/spaces";
import SpaceDetail from "@/components/SpaceDetail";

export function generateStaticParams() {
  return SPACES.map((s) => ({ id: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const space = getSpace(id);
  if (!space) return {};

  return {
    title: `${space.title} in ${space.location} | Yardly`,
    description: `${space.description} Book from $${space.hourlyPrice} per hour for up to ${space.capacity} guests.`,
    openGraph: {
      title: `${space.title} | Yardly`,
      description: `${space.neighborhood}, ${space.location} · $${space.hourlyPrice}/hour · ${space.rating.toFixed(2)} rating`,
      images: [{ url: space.images[0], alt: space.title }],
    },
  };
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
