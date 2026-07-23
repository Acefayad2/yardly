"use client";

import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Space } from "@/lib/types";
import { useEffect } from "react";

function priceIcon(price: number, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="price-marker${active ? " active" : ""}">$${price}/hr</div>`,
    iconSize: [0, 0],
  });
}

function FitBounds({ spaces }: { spaces: Space[] }) {
  const map = useMap();
  useEffect(() => {
    if (!spaces.length) return;
    const bounds = L.latLngBounds(spaces.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 11 });
  }, [spaces, map]);
  return null;
}

export default function MapView({
  spaces,
  activeId,
}: {
  spaces: Space[];
  activeId?: string;
}) {
  const router = useRouter();

  return (
    <MapContainer center={[39, -98]} zoom={4} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds spaces={spaces} />
      {spaces.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={priceIcon(s.hourlyPrice, s.id === activeId)}
          eventHandlers={{ click: () => router.push(`/spaces/${s.id}`) }}
        >
          <Popup>
            <div className="w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.images[0]} alt={s.title} className="mb-2 h-24 w-full rounded-lg object-cover" />
              <p className="text-sm font-semibold">{s.location}</p>
              <p className="text-xs text-neutral-500">${s.hourlyPrice}/hr · ★ {s.rating}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
