"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function DestinationSearch({ value, onChange, onChoose, autoFocus = false }: {
  value: string; onChange: (value: string) => void; onChoose?: () => void; autoFocus?: boolean;
}) {
  const { spaces, marketplaceLoading } = useStore();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const destinations = useMemo(() => {
    const cities = new Map<string, { count: number; types: Set<string> }>();
    spaces.forEach((space) => {
      const city = cities.get(space.location) ?? { count: 0, types: new Set<string>() };
      city.count++;
      city.types.add(space.spaceType);
      cities.set(space.location, city);
    });
    return [...cities].filter(([name]) => name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 6);
  }, [spaces, value]);
  const options = [{ title: "Explore all destinations", value: "", detail: "Find your next outdoor gathering", icon: "↗" },
    ...destinations.map(([name, city]) => ({ title: name, value: name, detail: [...city.types].slice(0, 2).join(" · "), icon: "⌂" }))];
  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
    onChoose?.();
  }
  return (
    <div className="destination-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input ref={input} autoFocus={autoFocus} name="q" value={value}
        role="combobox" aria-label="Search destinations" aria-autocomplete="list"
        aria-expanded={open} aria-controls={id}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder="Search cities or neighborhoods"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          }
          if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active].value); }
        }} />
      {open && <div className="destination-popover">
        <p className="destination-popover__eyebrow">{value ? "Matching destinations" : "Find your kind of outside"}</p>
        <div id={id} role="listbox" aria-label="Destination suggestions">
          {options.map((option, index) => <button type="button" key={option.title} id={`${id}-${index}`}
            role="option" aria-selected={active === index} className="destination-option"
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}>
            <span className={`destination-option__icon destination-option__icon--${index % 3}`} aria-hidden="true">{option.icon}</span>
            <span><strong>{option.title}</strong><small>{option.detail}</small></span>
            <span className="destination-option__arrow" aria-hidden="true">↗</span>
          </button>)}
        </div>
        {marketplaceLoading ? <p className="destination-popover__note" role="status">Loading destinations…</p> :
          value && destinations.length === 0 && <p className="destination-popover__note">No suggested cities match yet. You can still search for “{value}”.</p>}
      </div>}
    </div>
  );
}
