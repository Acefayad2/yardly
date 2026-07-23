"use client";

import Link from "next/link";
import { useState } from "react";
import { Space } from "@/lib/types";
import { useStore } from "@/lib/store";

export default function SpaceCard({ space }: { space: Space }) {
  const { favorites, toggleFavorite } = useStore();
  const [idx, setIdx] = useState(0);
  const isFav = favorites.includes(space.id);

  const go = (e: React.MouseEvent, dir: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + dir + space.images.length) % space.images.length);
  };

  return (
    <Link href={`/spaces/${space.id}`} className="group block">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-border-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={space.images[idx]}
          alt={space.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          loading="lazy"
        />

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(space.id);
          }}
          className="absolute right-3 top-3 transition hover:scale-110"
          aria-label={isFav ? "Remove from saved spaces" : "Save this space"}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-7 w-7 ${isFav ? "fill-brand" : "fill-black/40"} stroke-white`}
            strokeWidth={2}
          >
            <path d="M12 21s-7.5-4.6-10-9.2C.5 8.3 2 5 5.2 5c2 0 3.3 1.2 4.3 2.6l1.5 2 1.5-2C13.5 6.2 14.8 5 16.8 5 20 5 21.5 8.3 22 11.8 19.5 16.4 12 21 12 21z" />
          </svg>
        </button>

        <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold shadow">
          {space.topHost ? "★ Top host" : space.spaceType}
        </span>

        {space.images.length > 1 && (
          <>
            <button
              onClick={(e) => go(e, -1)}
              className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-background/90 opacity-0 shadow transition group-hover:opacity-100 hover:scale-105"
              aria-label="Previous photo"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2.5}><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              onClick={(e) => go(e, 1)}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-background/90 opacity-0 shadow transition group-hover:opacity-100 hover:scale-105"
              aria-label="Next photo"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth={2.5}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {space.images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-all ${i === idx ? "bg-white" : "bg-white/60"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-foreground">{space.location}</h3>
          <span className="flex shrink-0 items-center gap-1 text-sm">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" /></svg>
            {space.rating.toFixed(2)}
          </span>
        </div>
        <p className="truncate text-sm text-muted">{space.title}</p>
        <p className="truncate text-sm text-muted">Up to {space.capacity} guests</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-foreground">${space.hourlyPrice}</span>
          <span className="text-muted"> / hour</span>
        </p>
      </div>
    </Link>
  );
}
