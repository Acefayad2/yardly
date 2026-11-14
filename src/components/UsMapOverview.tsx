"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { DomEvent, type LatLngBoundsExpression } from "leaflet";
import states from "@/lib/us-state-bounds.json";

export default function UsMapOverview({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const map = useMap();
  const [open, setOpen] = useState(initiallyOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);

  const panel = useRef<HTMLElement>(null);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  useEffect(() => {
    if (!open || !panel.current) return;
    DomEvent.disableClickPropagation(panel.current);
    DomEvent.disableScrollPropagation(panel.current);
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  if (!open) return <button ref={trigger} className="us-map-trigger" type="button" onClick={() => {
    setOpen(true);
    requestAnimationFrame(() => select.current?.focus());
  }}>U.S. map</button>;

  return <section ref={panel} className="us-map-overview" aria-label="United States map">
    <header><h2>United States</h2><button type="button" onClick={close} aria-label="Return to street map">×</button></header>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/us-states.svg" alt="Map of all 50 states with Alaska and Hawaii shown as insets" />
    <select ref={select} aria-label="Zoom to a state" defaultValue="" onChange={event => {
      const state = states.find(item => item.name === event.target.value);
      if (!state) return;
      map.fitBounds(state.bounds as LatLngBoundsExpression, { padding: [26, 30], animate: false });
      close();
    }}>
      <option value="" disabled>Zoom to a state…</option>
      {states.map(state => <option key={state.name}>{state.name}</option>)}
    </select>
  </section>;
}
