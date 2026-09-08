import type { SpaceType } from "./types";

export const SPACE_TYPES: { name: SpaceType; icon: string }[] = [
  { name: "Backyards", icon: "🌳" },
  { name: "Pools", icon: "🏊" },
  { name: "Outdoor kitchens", icon: "🍽️" },
  { name: "Patios & decks", icon: "🪑" },
  { name: "Gardens", icon: "🌸" },
  { name: "Fire pits", icon: "🔥" },
  { name: "Rooftops", icon: "🏙️" },
  { name: "Sport courts", icon: "🏀" },
  { name: "Event yards", icon: "🎉" },
  { name: "Hot tubs", icon: "♨️" },
];

export function spaceHref(id: string, query = "") {
  const suffix = query ? `&${query.replace(/^\?/, "")}` : "";
  return `/spaces?id=${encodeURIComponent(id)}${suffix}`;
}
