"use client";

import Link from "next/link";
import { SPACE_TYPES } from "@/lib/spaces";
import type { SpaceType } from "@/lib/types";

export default function CategoryBar({
  active,
  onChange,
}: {
  active: SpaceType | "All";
  onChange: (c: SpaceType | "All") => void;
}) {
  const items = ["All", "Services", ...SPACE_TYPES.map((c) => c.name)] as const;

  return (
    <nav className="category-filter" aria-label="Browse spaces and services">
      <div className="category-filter__track">
        {items.map((name) => {
          if (name === "Services") return (
            <Link key={name} className="category-filter__item" href="/services/">
              <span className="category-filter__icon" aria-hidden="true">🛎️</span>
              <span>Services</span>
            </Link>
          );
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
