"use client";

import Link from "next/link";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Space } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

function priceIcon(price: number, active: boolean) {
  return L.divIcon({
    className: "yardly-map-marker",
    html: `<span class="yardly-map-marker__price${active ? " is-active" : ""}"><span class="yardly-map-marker__dot"></span>$${price}<small>/hr</small></span>`,
    iconSize: [86, 42],
    iconAnchor: [43, 42],
  });
}

function FitBounds({ spaces }: { spaces: Space[] }) {
  const map = useMap();

  useEffect(() => {
    if (!spaces.length) return;
    const bounds = L.latLngBounds(spaces.map((space) => [space.lat, space.lng]));
    map.fitBounds(bounds, {
      paddingTopLeft: [44, 96],
      paddingBottomRight: [44, 156],
      maxZoom: 12,
      animate: true,
    });
  }, [spaces, map]);

  return null;
}

function MapInteraction({ onBackgroundClick }: { onBackgroundClick: () => void }) {
  useMapEvents({ click: onBackgroundClick });
  return null;
}

function ViewportReporter({
  spaces,
  onVisibleChange,
}: {
  spaces: Space[];
  onVisibleChange: (ids: string[]) => void;
}) {
  const map = useMap();
  const reportVisible = useCallback(() => {
    const bounds = map.getBounds().pad(0.04);
    onVisibleChange(
      spaces
        .filter((space) => bounds.contains([space.lat, space.lng]))
        .map((space) => space.id),
    );
  }, [map, onVisibleChange, spaces]);

  useMapEvents({ moveend: reportVisible, zoomend: reportVisible });

  useEffect(() => {
    const frame = requestAnimationFrame(reportVisible);
    return () => cancelAnimationFrame(frame);
  }, [reportVisible]);

  return null;
}

function MapControls({
  onLocationFound,
  onLocationError,
}: {
  onLocationFound: (location: [number, number]) => void;
  onLocationError: () => void;
}) {
  const map = useMap();

  function findMe() {
    if (!navigator.geolocation) {
      onLocationError();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location: [number, number] = [coords.latitude, coords.longitude];
        onLocationFound(location);
        map.flyTo(location, 12, { duration: 1.1 });
      },
      onLocationError,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="yardly-map-controls" aria-label="Map controls">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span aria-hidden="true" />
      <button type="button" onClick={findMe} aria-label="Use my location">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      </button>
    </div>
  );
}

export default function MapView({
  spaces,
  activeId,
  onActiveChange,
  onVisibleChange,
}: {
  spaces: Space[];
  activeId?: string;
  onActiveChange?: (id?: string) => void;
  onVisibleChange?: (ids: string[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(activeId);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(spaces.length);

  const effectiveSelectedId = activeId ?? selectedId;

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.id === effectiveSelectedId),
    [effectiveSelectedId, spaces],
  );

  function selectSpace(id?: string) {
    setSelectedId(id);
    onActiveChange?.(id);
  }

  const reportVisible = useCallback((ids: string[]) => {
    setVisibleCount(ids.length);
    onVisibleChange?.(ids);
  }, [onVisibleChange]);

  return (
    <div className="yardly-map-shell">
      <MapContainer
        center={[39, -98]}
        zoom={4}
        minZoom={3}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds spaces={spaces} />
        <MapInteraction onBackgroundClick={() => selectSpace(undefined)} />
        <ViewportReporter spaces={spaces} onVisibleChange={reportVisible} />
        <MapControls
          onLocationFound={(location) => {
            setUserLocation(location);
            setLocationMessage("Showing your location");
          }}
          onLocationError={() => setLocationMessage("Location is unavailable")}
        />

        {userLocation && (
          <CircleMarker
            center={userLocation}
            radius={8}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "#167a52", fillOpacity: 1 }}
          />
        )}

        {spaces.map((space) => {
          const isActive = space.id === effectiveSelectedId;
          return (
            <Marker
              key={space.id}
              position={[space.lat, space.lng]}
              icon={priceIcon(space.hourlyPrice, isActive)}
              title={`${space.title}, $${space.hourlyPrice} per hour`}
              alt={space.title}
              eventHandlers={{ click: () => selectSpace(space.id) }}
              zIndexOffset={isActive ? 1000 : 0}
            />
          );
        })}
      </MapContainer>

      <div className="yardly-map-status" aria-live="polite">
        <span />
        {locationMessage ?? `${visibleCount} ${visibleCount === 1 ? "space" : "spaces"} in view`}
      </div>

      {selectedSpace && (
        <article className="yardly-map-preview animate-fade-in">
          <button
            type="button"
            className="yardly-map-preview__close"
            onClick={() => selectSpace(undefined)}
            aria-label="Close space preview"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          <Link href={`/spaces/${selectedSpace.id}`} className="yardly-map-preview__link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedSpace.images[0]} alt={selectedSpace.title} />
            <div>
              <div className="yardly-map-preview__eyebrow">
                <span>{selectedSpace.neighborhood}</span>
                <span aria-label={`${selectedSpace.rating} out of 5 stars`}>★ {selectedSpace.rating}</span>
              </div>
              <h3>{selectedSpace.title}</h3>
              <p>
                <strong>${selectedSpace.hourlyPrice}</strong> / hour
                <span> · </span>
                Up to {selectedSpace.capacity} guests
              </p>
            </div>
            <span className="yardly-map-preview__arrow" aria-hidden="true">→</span>
          </Link>
        </article>
      )}

      {!spaces.length && (
        <div className="yardly-map-empty">
          <span aria-hidden="true">⌖</span>
          <strong>No spaces in this area</strong>
          <p>Adjust your search or choose another category.</p>
        </div>
      )}
    </div>
  );
}
