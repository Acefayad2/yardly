"use client";

import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Listing } from "@/lib/types";
import { useEffect } from "react";

function priceIcon(price: number, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="price-marker${active ? " active" : ""}">$${price}</div>`,
    iconSize: [0, 0],
  });
}

function FitBounds({ listings }: { listings: Listing[] }) {
  const map = useMap();
  useEffect(() => {
    if (!listings.length) return;
    const bounds = L.latLngBounds(listings.map((l) => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });
  }, [listings, map]);
  return null;
}

export default function MapView({
  listings,
  activeId,
}: {
  listings: Listing[];
  activeId?: string;
}) {
  const router = useRouter();

  return (
    <MapContainer
      center={[30, 0]}
      zoom={2}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds listings={listings} />
      {listings.map((l) => (
        <Marker
          key={l.id}
          position={[l.lat, l.lng]}
          icon={priceIcon(l.price, l.id === activeId)}
          eventHandlers={{ click: () => router.push(`/rooms/${l.id}`) }}
        >
          <Popup>
            <div className="w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.images[0]} alt={l.title} className="mb-2 h-24 w-full rounded-lg object-cover" />
              <p className="text-sm font-semibold">{l.location}</p>
              <p className="text-xs text-neutral-500">${l.price} night · ★ {l.rating}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
