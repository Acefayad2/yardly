"use client";

import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Space } from "@/lib/types";
import { useEffect } from "react";

function priceIcon(price: number, active: boolean, topHost: boolean) {
  return L.divIcon({
    // Custom className replaces Leaflet's default "leaflet-div-icon" (which ships
    // its own background/border), so the wrapper renders fully unstyled.
    className: "price-marker-icon",
    html: `<div class="price-pin${active ? " active" : ""}"><span class="price-pill">${
      topHost ? '<span class="price-pill-star">★</span>' : ""
    }$${price}/hr</span></div>`,
    // The wrapper is intentionally zero-size and pinned exactly at the marker's
    // lat/lng (iconAnchor: [0, 0]) with no size-based offset. The visible pill is
    // centered on that point itself via CSS transform (see .price-pin), so it
    // never depends on Leaflet's box-model sizing of the icon wrapper.
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
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
  onMarkerHover,
}: {
  spaces: Space[];
  activeId?: string;
  onMarkerHover?: (id: string | null) => void;
}) {
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
          icon={priceIcon(s.hourlyPrice, s.id === activeId, s.topHost)}
          eventHandlers={
            onMarkerHover
              ? {
                  mouseover: () => onMarkerHover(s.id),
                  mouseout: () => onMarkerHover(null),
                }
              : undefined
          }
        >
          <Popup>
            <Link href={`/spaces/${s.id}`} className="block w-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.images[0]} alt={s.title} className="mb-2 h-28 w-full rounded-lg object-cover" />
              <p className="truncate text-sm font-semibold text-neutral-900">{s.location}</p>
              <p className="truncate text-xs text-neutral-500">{s.title}</p>
              <p className="mt-0.5 text-xs text-neutral-700">
                ${s.hourlyPrice}/hr · ★ {s.rating.toFixed(2)}
              </p>
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
