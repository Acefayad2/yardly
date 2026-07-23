"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { LISTINGS } from "@/lib/listings";
import { Category } from "@/lib/types";
import CategoryBar from "./CategoryBar";
import ListingCard from "./ListingCard";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-border-soft text-sm text-muted">
      Loading map…
    </div>
  ),
});

export default function Explore() {
  const params = useSearchParams();
  const query = (params.get("q") ?? "").toLowerCase();
  const [category, setCategory] = useState<Category | "All">("All");
  const [showMap, setShowMap] = useState(false);

  const listings = useMemo(() => {
    return LISTINGS.filter((l) => {
      const matchCat =
        category === "All" ||
        l.category === category ||
        (category === "Trending" && l.rating >= 4.9);
      const matchQuery =
        !query ||
        l.location.toLowerCase().includes(query) ||
        l.country.toLowerCase().includes(query) ||
        l.title.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });
  }, [category, query]);

  return (
    <div>
      <div className="sticky top-[73px] z-30 border-b border-border-soft bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6">
          <CategoryBar active={category} onChange={setCategory} />
        </div>
      </div>

      {query && (
        <p className="mx-auto max-w-7xl px-6 pt-5 text-sm text-muted">
          {listings.length} {listings.length === 1 ? "stay" : "stays"} matching “{query}”
        </p>
      )}

      {showMap ? (
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 lg:h-[calc(100vh-160px)] lg:flex-row">
          <div className="no-scrollbar grid grid-cols-1 gap-6 overflow-y-auto sm:grid-cols-2 lg:w-1/2">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
          <div className="h-[400px] overflow-hidden rounded-2xl lg:h-full lg:w-1/2">
            <MapView listings={listings} />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          {listings.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-lg font-semibold">No stays found</p>
              <p className="text-muted">Try a different destination or category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowMap((v) => !v)}
        className="fixed bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:scale-105"
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
