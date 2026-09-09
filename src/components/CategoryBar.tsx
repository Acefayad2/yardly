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
          const icon = name === "All" ? "✨" : SPACE_TYPES.find((category) => category.name === name)?.icon ?? "•";
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-pressed={isActive}
              className={`category-filter__item${isActive ? " is-active" : ""}`}
            >
              <span className="category-filter__icon" aria-hidden="true">{icon}</span>
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
