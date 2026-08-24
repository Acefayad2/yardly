"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

export interface TripMapPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  image: string;
}

function photoIcon(point: TripMapPoint) {
  const safeImage = point.image.replaceAll('"', "&quot;");
  const safeLabel = point.label.split(",")[0].replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return L.divIcon({
    className: "trip-map-marker",
    html: `<span class="trip-map-marker__photo"><img src="${safeImage}" alt="" /></span><span class="trip-map-marker__dot"></span><span class="trip-map-marker__label">${safeLabel}</span>`,
    iconSize: [110, 92],
    iconAnchor: [55, 70],
  });
}

export default function TripsMap({ points }: { points: TripMapPoint[] }) {
  return (
    <div className="trips-map" aria-label="Map of upcoming Yardly trips">
      <MapContainer
        center={[37.4, -98.5]}
        zoom={3}
        minZoom={2}
        zoomControl={false}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={photoIcon(point)}
            title={point.label}
            alt={point.label}
          />
        ))}
      </MapContainer>
    </div>
  );
}
