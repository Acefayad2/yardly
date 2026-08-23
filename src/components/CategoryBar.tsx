"use client";

import { SPACE_TYPES } from "@/lib/spaces";
import { SpaceType } from "@/lib/types";

export default function CategoryBar({
  active,
  onChange,
}: {
  active: SpaceType | "All";
  onChange: (c: SpaceType | "All") => void;
}) {
  const items: (SpaceType | "All")[] = ["All", ...SPACE_TYPES.map((c) => c.name)];
  const iconFor = (name: string) =>
    name === "All" ? "✨" : SPACE_TYPES.find((c) => c.name === name)?.icon ?? "•";

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 py-2 md:gap-6 md:py-1" aria-label="Filter by space type">
      {items.map((name) => {
        const isActive = active === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-pressed={isActive}
            className={`group flex shrink-0 flex-row items-center gap-2 rounded-full border px-4 py-2.5 shadow-sm transition md:flex-col md:rounded-none md:border-x-0 md:border-t-0 md:border-b-2 md:px-0 md:pb-3 md:pt-1 md:shadow-none ${
              isActive
                ? "border-foreground bg-foreground text-white md:bg-transparent md:text-foreground"
                : "border-border bg-white text-muted hover:border-foreground hover:text-foreground md:border-transparent md:bg-transparent md:hover:border-border"
            }`}
          >
            <span className={`text-base transition md:text-2xl ${isActive ? "" : "opacity-70 group-hover:opacity-100"}`}>
              {iconFor(name)}
            </span>
            <span className="whitespace-nowrap text-sm font-medium md:text-xs">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
