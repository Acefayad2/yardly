export type AddressSuggestion = {
  id: string;
  label: string;
  publicLocation: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(parts: string[]) {
  return parts.filter((part, index) => part && parts.indexOf(part) === index);
}

function parseFeature(feature: PhotonFeature, index: number): AddressSuggestion | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const properties = feature.properties ?? {};
  const houseNumber = text(properties.housenumber);
  const street = text(properties.street);
  const name = text(properties.name);
  const city = text(properties.city) || text(properties.locality) || text(properties.county);
  const state = text(properties.state);
  const postcode = text(properties.postcode);
  const country = text(properties.country);
  const neighborhood = text(properties.district) || text(properties.locality) || city;
  const streetLine = [houseNumber, street].filter(Boolean).join(" ") || name;
  const label = unique([streetLine, city, state, postcode, country]).join(", ");
  const publicLocation = unique([city, state]).join(", ") || unique([state, country]).join(", ");

  if (!label || !publicLocation) return null;

  return {
    id: `${text(properties.osm_type) || "place"}-${String(properties.osm_id ?? index)}`,
    label,
    publicLocation,
    neighborhood: neighborhood || publicLocation,
    latitude,
    longitude,
  };
}

export async function searchAddresses(query: string, signal?: AbortSignal) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Address search is temporarily unavailable.");

  const data = await response.json() as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (data.features ?? [])
    .map(parseFeature)
    .filter((suggestion): suggestion is AddressSuggestion => {
      if (!suggestion || seen.has(suggestion.label)) return false;
      seen.add(suggestion.label);
      return true;
    });
}
