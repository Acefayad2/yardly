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
    <div className="no-scrollbar flex gap-7 overflow-x-auto px-1 py-1">
      {items.map((name) => {
        const isActive = active === name;
        return (
          <button
            key={name}
            onClick={() => onChange(name)}
            className={`group flex shrink-0 flex-col items-center gap-2 border-b-2 pb-3 pt-1 transition ${
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted hover:border-border hover:text-foreground"
            }`}
          >
            <span className={`text-2xl transition ${isActive ? "" : "opacity-70 group-hover:opacity-100"}`}>
              {iconFor(name)}
            </span>
            <span className="whitespace-nowrap text-xs font-medium">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
