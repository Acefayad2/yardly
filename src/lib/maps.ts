const cartoBasemapKey = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY?.trim();

export const MAP_TILE_URL = cartoBasemapKey
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoBasemapKey)}`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const MAP_TILE_SUBDOMAINS = cartoBasemapKey ? "abcd" : "abc";

export const MAP_TILE_ATTRIBUTION = cartoBasemapKey
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
