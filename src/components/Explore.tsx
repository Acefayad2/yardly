"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { SPACES } from "@/lib/spaces";
import { SpaceType } from "@/lib/types";
import CategoryBar from "./CategoryBar";
import SpaceCard from "./SpaceCard";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status" aria-label="Loading map">
      <span className="map-loading__road map-loading__road--one" />
      <span className="map-loading__road map-loading__road--two" />
      <span className="map-loading__pin map-loading__pin--one" />
      <span className="map-loading__pin map-loading__pin--two" />
      <span className="map-loading__label">Finding nearby spaces</span>
    </div>
  ),
});

export default function Explore() {
  const params = useSearchParams();
  const query = (params.get("q") ?? "").toLowerCase();
  const [spaceType, setSpaceType] = useState<SpaceType | "All">("All");
  const [showMap, setShowMap] = useState(false);
  const [activeSpaceId, setActiveSpaceId] = useState<string>();

  const spaces = useMemo(() => {
    return SPACES.filter((s) => {
      const matchType = spaceType === "All" || s.spaceType === spaceType;
      const matchQuery =
        !query ||
        s.location.toLowerCase().includes(query) ||
        s.neighborhood.toLowerCase().includes(query) ||
        s.title.toLowerCase().includes(query) ||
        s.spaceType.toLowerCase().includes(query);
      return matchType && matchQuery;
    });
  }, [spaceType, query]);

  return (
    <div>
      <div className="sticky top-[73px] z-30 border-b border-border-soft bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6">
          <CategoryBar active={spaceType} onChange={setSpaceType} />
        </div>
      </div>

      {query && (
        <p className="mx-auto max-w-7xl px-6 pt-5 text-sm text-muted">
          {spaces.length} {spaces.length === 1 ? "space" : "spaces"} matching “{query}”
        </p>
      )}

      {showMap ? (
        <div className="mx-auto h-[calc(100dvh-166px)] max-w-[1440px] px-0 lg:h-[calc(100vh-150px)] lg:px-6 lg:py-5">
          <div className="map-mode-layout h-full">
            <section className="no-scrollbar hidden overflow-y-auto lg:block" aria-label="Spaces in map view">
              <div className="map-results-heading">
                <div>
                  <p>Places to make your own</p>
                  <h2>{spaces.length} spaces available</h2>
                </div>
                <span>Updated today</span>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-8 px-1 pb-8 xl:grid-cols-2">
                {spaces.map((space) => (
                  <div
                    key={space.id}
                    onMouseEnter={() => setActiveSpaceId(space.id)}
                    onMouseLeave={() => setActiveSpaceId(undefined)}
                    onFocusCapture={() => setActiveSpaceId(space.id)}
                  >
                    <SpaceCard space={space} />
                  </div>
                ))}
              </div>
            </section>
            <section className="map-canvas-frame" aria-label="Map of available spaces">
              <MapView
                spaces={spaces}
                activeId={activeSpaceId}
                onActiveChange={setActiveSpaceId}
              />
            </section>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          {spaces.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-lg font-semibold">No spaces found</p>
              <p className="text-muted">Try a different city or space type.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {spaces.map((s) => (
                <SpaceCard key={s.id} space={s} />
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowMap((v) => !v)}
        className="safe-bottom-floating view-toggle fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm font-semibold text-white transition"
        aria-pressed={showMap}
      >
        {showMap ? "Show list" : "Show map"}
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          {showMap ? (
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zm0 0v15m6-12v15" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          )}
        </svg>
      </button>
    </div>
  );
}
