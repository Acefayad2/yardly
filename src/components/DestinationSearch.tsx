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
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  function locate() {
    if (locating) return;
    setLocationError("");
    if (!navigator.geolocation) { setLocationError("Location isn’t supported here. Search for a city instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setNearby({ latitude: coords.latitude, longitude: coords.longitude });
      onChange(""); setLocating(false); setOpen(true);
    }, (error) => {
      setLocating(false);
      setLocationError(error.code === 1 ? "Location permission is off. Allow it in your browser or type a city." : "We couldn’t find your location. Try again or type a city.");
    }, { timeout: 10000, maximumAge: 60000 });
  }
  const destinations = useMemo(() => {
    const cities = new Map<string, { count: number; types: Set<string> }>();
    spaces.forEach((space) => {
      if (nearby) {
        const radians = Math.PI / 180;
        const a = Math.sin((space.lat - nearby.latitude) * radians / 2) ** 2 + Math.cos(nearby.latitude * radians) * Math.cos(space.lat * radians) * Math.sin((space.lng - nearby.longitude) * radians / 2) ** 2;
        if (!Number.isFinite(a) || 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) > 50) return;
      }
      const city = cities.get(space.location) ?? { count: 0, types: new Set<string>() };
      city.count++;
      city.types.add(space.spaceType);
      cities.set(space.location, city);
    });
    return [...cities].filter(([name]) => name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 6);
  }, [spaces, value, nearby]);
  const icons: Record<string, string> = { Backyards: "🏡", Pools: "🏊", Gardens: "🌿", Rooftops: "🏙️", "Outdoor kitchens": "🍽️", "Patios & decks": "🪑", "Fire pits": "🔥", "Sport courts": "🏀", "Event yards": "🎉", "Hot tubs": "♨️" };
  const options = [{ title: "Nearby", value: "", detail: locating ? "Finding your location…" : "Find destinations within 50 km", icon: "nearby" },
    { title: "Explore all destinations", value: "", detail: "Find your next outdoor gathering", icon: "🌎" },
    ...destinations.map(([name, city]) => ({ title: name, value: name, detail: [...city.types].slice(0, 2).join(" · "), icon: icons[[...city.types][0]] || "🌿" }))];
  function select(index: number) {
    if (index === 0) { locate(); return; }
    setNearby(null); setLocationError(""); choose(options[index].value);
  }
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
        onChange={(event) => { setNearby(null); setLocationError(""); onChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          }
          if (event.key === "Enter" && open && options[active]) { event.preventDefault(); select(active); }
        }} />
      {open && <div className="destination-popover">
        <p className="destination-popover__eyebrow">{nearby ? "Destinations within 50 km" : value ? "Matching destinations" : "Find your kind of outside"}</p>
        {locationError && <p className="destination-popover__note" role="alert">{locationError}</p>}
        {nearby && !destinations.length && !marketplaceLoading && <p className="destination-popover__note" role="status">No destinations within 50 km yet. Try another city or explore all destinations.</p>}
        <div id={id} role="listbox" aria-label="Destination suggestions">
          {options.map((option, index) => <button type="button" key={option.title} id={`${id}-${index}`}
            role="option" aria-selected={active === index} className="destination-option"
            aria-disabled={index === 0 && locating} onMouseDown={(event) => event.preventDefault()} onClick={() => select(index)}>
            <span className={`destination-option__icon destination-option__icon--${index % 3}`} aria-hidden="true">{option.icon === "nearby" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m21 3-6.5 18-3.2-8.3L3 9.5 21 3Z" /></svg> : option.icon}</span>
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
