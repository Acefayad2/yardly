"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const rawQuery = params.get("q") ?? "";
  const query = rawQuery.toLowerCase();
  const requestedDate = params.get("date") ?? "";
  const requestedGuests = Math.max(1, Number(params.get("guests") ?? "1") || 1);
  const [spaceType, setSpaceType] = useState<SpaceType | "All">("All");
  const [showMap, setShowMap] = useState(false);
  const [activeSpaceId, setActiveSpaceId] = useState<string>();
  const [visibleMapState, setVisibleMapState] = useState<{ scope: string; ids: string[] }>();

  const spaces = useMemo(() => {
    return SPACES.filter((s) => {
      const matchType = spaceType === "All" || s.spaceType === spaceType;
      const matchQuery =
        !query ||
        s.location.toLowerCase().includes(query) ||
        s.neighborhood.toLowerCase().includes(query) ||
        s.title.toLowerCase().includes(query) ||
        s.spaceType.toLowerCase().includes(query);
      return matchType && matchQuery && s.capacity >= requestedGuests;
    });
  }, [spaceType, query, requestedGuests]);

  const spaceScope = spaces.map((space) => space.id).join("|");
  const visibleMapIds = visibleMapState?.scope === spaceScope ? visibleMapState.ids : undefined;

  const mapListSpaces = visibleMapIds
    ? spaces.filter((space) => visibleMapIds.includes(space.id))
    : spaces;

  const bookingQuery = useMemo(() => {
    const next = new URLSearchParams();
    if (requestedDate) next.set("date", requestedDate);
    if (requestedGuests > 1) next.set("guests", String(requestedGuests));
    const value = next.toString();
    return value ? `?${value}` : "";
  }, [requestedDate, requestedGuests]);

  function clearSearch() {
    setSpaceType("All");
    router.push("/#discover");
  }

  return (
    <div>
      {!showMap && (
        <section className="hero-shell">
          <div className="hero-content">
            <p className="hero-eyebrow">Room for the good stuff</p>
            <h1>Private outdoor spaces, booked by the hour.</h1>
            <p className="hero-copy">
              Find a backyard, pool, garden, or rooftop for celebrations, shoots, dinners, and days that deserve more space.
            </p>

            <TripSearch
              key={`${rawQuery}|${requestedDate}|${requestedGuests}`}
              initialLocation={rawQuery}
              initialDate={requestedDate}
              initialGuests={requestedGuests}
            />

            <div className="hero-assurances" aria-label="Yardly booking benefits">
              <span>Clear hourly pricing</span>
              <span>Rules before you book</span>
              <span>Exact address stays private</span>
            </div>
          </div>
        </section>
      )}

      <div id="discover" className="sticky top-[65px] z-30 scroll-mt-24 border-b border-border-soft bg-background/95 backdrop-blur sm:top-[73px] lg:top-[169px] lg:scroll-mt-48">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <CategoryBar active={spaceType} onChange={setSpaceType} />
        </div>
      </div>

      {(query || requestedDate || requestedGuests > 1) && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 pt-6 text-sm">
          <p className="text-muted">
            <strong className="text-foreground">{spaces.length} {spaces.length === 1 ? "space" : "spaces"}</strong>
            {query ? <> near “{rawQuery}”</> : null}
            {requestedGuests > 1 ? <> for {requestedGuests} guests</> : null}
            {requestedDate ? <> on {new Date(`${requestedDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</> : null}
          </p>
          <button type="button" onClick={clearSearch} className="font-semibold text-brand-dark underline underline-offset-4">
            Clear search
          </button>
        </div>
      )}

      {showMap ? (
        <div className="mx-auto h-[calc(100dvh-166px)] max-w-[1440px] px-0 lg:h-[calc(100vh-150px)] lg:px-6 lg:py-5">
          <div className="map-mode-layout h-full">
            <section className="no-scrollbar hidden overflow-y-auto lg:block" aria-label="Spaces in map view">
              <div className="map-results-heading">
                <div>
                  <p>Places to make your own</p>
                  <h2>{mapListSpaces.length} spaces in this map area</h2>
                </div>
                <span>Updated today</span>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-8 px-1 pb-8 xl:grid-cols-2">
                {mapListSpaces.map((space) => (
                  <div
                    key={space.id}
                    onMouseEnter={() => setActiveSpaceId(space.id)}
                    onMouseLeave={() => setActiveSpaceId(undefined)}
                    onFocusCapture={() => setActiveSpaceId(space.id)}
                  >
                    <SpaceCard space={space} bookingQuery={bookingQuery} />
                  </div>
                ))}
              </div>
            </section>
            <section className="map-canvas-frame" aria-label="Map of available spaces">
              <MapView
                spaces={spaces}
                activeId={activeSpaceId}
                onActiveChange={setActiveSpaceId}
                onVisibleChange={(ids) => setVisibleMapState({ scope: spaceScope, ids })}
              />
            </section>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
          {spaces.length === 0 ? (
            <div className="rounded-3xl bg-surface-soft px-6 py-20 text-center">
              <p className="text-lg font-semibold">No spaces found</p>
              <p className="text-muted">Try a different city or space type.</p>
              <button type="button" onClick={clearSearch} className="mt-5 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-white">
                Reset search
              </button>
            </div>
          ) : (
            <>
              <div className="mobile-discovery-heading md:hidden">
                <h2>Popular outdoor spaces near you</h2>
                <span aria-hidden="true">→</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
                {spaces.map((s) => (
                  <SpaceCard key={s.id} space={s} bookingQuery={bookingQuery} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setShowMap((v) => !v)}
        className="safe-bottom-floating view-toggle fixed left-1/2 z-30 flex items-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm font-semibold text-white"
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

function TripSearch({
  initialLocation,
  initialDate,
  initialGuests,
}: {
  initialLocation: string;
  initialDate: string;
  initialGuests: number;
}) {
  const router = useRouter();
  const [location, setLocation] = useState(initialLocation);
  const [date, setDate] = useState(initialDate);
  const [guests, setGuests] = useState(initialGuests);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (location.trim()) next.set("q", location.trim());
    if (date) next.set("date", date);
    if (guests > 1) next.set("guests", String(guests));
    router.push(next.size ? `/?${next.toString()}#discover` : "/#discover");
  }

  return (
    <form className="trip-search" onSubmit={submit} aria-label="Plan your Yardly search">
      <label className="trip-search__field trip-search__field--location">
        <span>Where</span>
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or neighborhood" />
      </label>
      <label className="trip-search__field">
        <span>When</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Booking date" />
      </label>
      <label className="trip-search__field">
        <span>Guests</span>
        <select value={guests} onChange={(event) => setGuests(Number(event.target.value))}>
          {Array.from({ length: 60 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count} {count === 1 ? "guest" : "guests"}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="trip-search__submit">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <span>Search spaces</span>
      </button>
    </form>
  );
}
