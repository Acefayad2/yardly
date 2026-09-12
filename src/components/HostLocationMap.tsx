"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { AddressSuggestion } from "@/lib/geocoding";
import { MAP_TILE_ATTRIBUTION, MAP_TILE_SUBDOMAINS, MAP_TILE_URL } from "@/lib/maps";

function animatedPin() {
  return L.divIcon({
    className: "host-location-marker",
    html: '<span class="host-location-marker__pulse"></span><span class="host-location-marker__pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>',
    iconSize: [58, 58],
    iconAnchor: [29, 48],
  });
}

function FlyToAddress({ address }: { address: AddressSuggestion }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([address.latitude, address.longitude], 15, {
      animate: true,
      duration: 0.9,
    });
  }, [address, map]);

  return null;
}

export default function HostLocationMap({ address }: { address: AddressSuggestion | null }) {
  const pin = useMemo(() => animatedPin(), []);

  return (
    <div className="host-location-map" aria-label={address ? `Map preview for ${address.label}` : "Map preview awaiting an address"}>
      <MapContainer
        center={address ? [address.latitude, address.longitude] : [39, -98]}
        zoom={address ? 15 : 4}
        minZoom={3}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution={MAP_TILE_ATTRIBUTION}
          subdomains={MAP_TILE_SUBDOMAINS}
          url={MAP_TILE_URL}
        />
        {address && (
          <>
            <FlyToAddress address={address} />
            <Marker position={[address.latitude, address.longitude]} icon={pin} keyboard={false} />
          </>
        )}
      </MapContainer>

      {!address && (
        <div className="host-location-map__empty">
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          </span>
          <strong>Your map preview</strong>
          <p>Start typing an address to place your pin.</p>
        </div>
      )}

      {address && (
        <div className="host-location-map__status animate-fade-in">
          <span aria-hidden="true" />
          <div><strong>Pin placed</strong><small>{address.publicLocation}</small></div>
        </div>
      )}
    </div>
  );
}
