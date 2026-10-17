export type CommunitySpaceType = "park" | "gym" | "recreation_center" | "community_center" | "other";
export interface CommunitySpace {
  id: string; name: string; type: CommunitySpaceType; location: string; capacity: number | null; amenities: string[];
  publishedPricing: string; restrictions: string; officialUrl: string; sourceName: string; lastCheckedAt: string | null; published: boolean; contentRevision: number;
}
export const COMMUNITY_SPACE_SELECT = "id,name,space_type,location,capacity,amenities,published_pricing,restrictions,source_name,last_checked_at,is_published,content_revision,community_space_sources(official_url)";
export function mapCommunitySpace(row: Record<string, unknown>): CommunitySpace {
  const source = Array.isArray(row.community_space_sources) ? row.community_space_sources[0] as Record<string, unknown> | undefined : row.community_space_sources as Record<string, unknown> | undefined;
  return { id: String(row.id ?? ""), name: String(row.name ?? ""), type: spaceType(row.space_type), location: String(row.location ?? ""),
    capacity: row.capacity == null ? null : Number(row.capacity), amenities: Array.isArray(row.amenities) ? row.amenities.map(String) : [],
    publishedPricing: String(row.published_pricing ?? ""), restrictions: String(row.restrictions ?? ""), officialUrl: String(source?.official_url ?? ""),
    sourceName: String(row.source_name ?? ""), lastCheckedAt: typeof row.last_checked_at === "string" ? row.last_checked_at : null, published: row.is_published === true,
    contentRevision: Number(row.content_revision ?? 1) };
}
export function isCommunitySpaceStale(lastCheckedAt: string | null, now = Date.now()) {
  if (!lastCheckedAt) return true;
  const checked = Date.parse(lastCheckedAt);
  return !Number.isFinite(checked) || now - checked > 7 * 24 * 60 * 60 * 1000;
}
export function communitySpacePayload(form: FormData, id: string | null = null) {
  const capacity = String(form.get("capacity") ?? "").trim();
  return { p_id: id, p_name: value(form, "name"), p_space_type: value(form, "type"), p_location: value(form, "location"),
    p_capacity: capacity ? Number(capacity) : null, p_amenities: value(form, "amenities").split(",").map((item) => item.trim()).filter(Boolean),
    p_published_pricing: value(form, "pricing"), p_restrictions: value(form, "restrictions"), p_official_url: value(form, "officialUrl"), p_source_name: value(form, "sourceName") };
}
function value(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }
function spaceType(value: unknown): CommunitySpaceType { return value === "park" || value === "gym" || value === "recreation_center" || value === "community_center" ? value : "other"; }
