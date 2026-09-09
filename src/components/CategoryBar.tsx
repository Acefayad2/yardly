"use client";

import { SPACE_TYPES } from "@/lib/spaces";
import type { SpaceType } from "@/lib/types";

export default function CategoryBar({
  active,
  onChange,
}: {
  active: SpaceType | "All";
  onChange: (c: SpaceType | "All") => void;
}) {
  const items: (SpaceType | "All")[] = ["All", ...SPACE_TYPES.map((c) => c.name)];

  return (
    <nav className="category-filter" aria-label="Filter by space type">
      <div className="category-filter__track">
        {items.map((name) => {
          const isActive = active === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-pressed={isActive}
              className={`category-filter__item${isActive ? " is-active" : ""}`}
            >
              <span className="category-filter__icon" aria-hidden="true">
                <CategoryIcon name={name} />
              </span>
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CategoryIcon({ name }: { name: SpaceType | "All" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (name === "Backyards") return <svg {...common}><path d="M12 21v-7"/><path d="M8.5 14.5a4.5 4.5 0 1 1 7 0A3.5 3.5 0 0 1 12 14a3.5 3.5 0 0 1-3.5.5Z"/><path d="M4 21h16"/></svg>;
  if (name === "Pools") return <svg {...common}><path d="M3 8.5c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 2 1.5"/><path d="M3 14c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 2 1.5"/></svg>;
  if (name === "Outdoor kitchens") return <svg {...common}><path d="M6 3v7M3.5 3v4.5A2.5 2.5 0 0 0 6 10M8.5 3v4.5A2.5 2.5 0 0 1 6 10v11"/><path d="M16 3v18M16 3c3 2 4.5 6 0 9"/></svg>;
  if (name === "Patios & decks") return <svg {...common}><path d="M3 11a9 9 0 0 1 18 0H3Z"/><path d="M12 11v10M7 21h10M5 15h14"/></svg>;
  if (name === "Gardens") return <svg {...common}><circle cx="12" cy="12" r="2"/><path d="M12 4c2 0 3 2 3 4-2 0-3-1-3-4ZM20 12c0 2-2 3-4 3 0-2 1-3 4-3ZM12 20c-2 0-3-2-3-4 2 0 3 1 3 4ZM4 12c0-2 2-3 4-3 0 2-1 3-4 3Z"/></svg>;
  if (name === "Fire pits") return <svg {...common}><path d="M12 21c4 0 7-2.7 7-6.4 0-2.7-1.7-5.2-4.5-7.6.1 2-1 3.1-2 3.8.1-3.3-1.5-5.7-4-7.8.2 3.5-3.5 6.5-3.5 11.6C5 18.3 8 21 12 21Z"/><path d="M9.5 17.5c0-1.8 1.2-3.1 2.7-4.5.1 1.4.8 2.3 1.5 3 .5.5.8 1.1.8 1.7"/></svg>;
  if (name === "Rooftops") return <svg {...common}><path d="M4 21V8h10v13M14 12h6v9M7 11h2M7 15h2M7 19h2M16.5 15h1M16.5 18h1M2 21h20"/><path d="m3 8 6-5 6 5"/></svg>;
  if (name === "Sport courts") return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c2.5 2.5 3.6 5.4 3.4 8.5-.2 3-1.5 5.9-3.4 8.5M3.5 12h17M5.5 6.5c3 1.2 5 3 6.5 5.5 1.5 2.5 3.5 4.3 6.5 5.5"/></svg>;
  if (name === "Event yards") return <svg {...common}><path d="m4 20 4.5-11 6.5 6.5L4 20Z"/><path d="m8.5 9 6.5 6.5M14 4l.5 2M19 8l-2 .5M18 3l-2 2M10 3l1 2M20.5 13l-2-.5"/></svg>;
  if (name === "Hot tubs") return <svg {...common}><path d="M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4ZM4 15h16"/><path d="M8 9c-2-2 2-3 0-5M12 9c-2-2 2-3 0-5M16 9c-2-2 2-3 0-5"/></svg>;
  return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>;
}
