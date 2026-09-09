"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useEffect, useId, useState } from "react";
import { searchAddresses } from "@/lib/geocoding";
import type { AddressSuggestion } from "@/lib/geocoding";

const HostLocationMap = dynamic(() => import("./HostLocationMap"), {
  ssr: false,
  loading: () => <div className="host-location-map host-location-map--loading" role="status">Loading map…</div>,
});

export default function AddressMapPicker({
  selected,
  onSelect,
  error,
}: {
  selected: AddressSuggestion | null;
  onSelect: (suggestion: AddressSuggestion | null) => void;
  error?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(selected?.label ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [preview, setPreview] = useState<AddressSuggestion | null>(selected);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (selected?.label === trimmed || trimmed.length < 4) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const results = await searchAddresses(trimmed, controller.signal);
        setSuggestions(results);
        setPreview(results[0] ?? null);
        setActiveIndex(0);
        setOpen(true);
        if (!results.length) setSearchError("No matching address found. Add the city and state, then try again.");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setSuggestions([]);
        setPreview(null);
        setSearchError("Address search is temporarily unavailable. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 550);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function choose(suggestion: AddressSuggestion) {
    setQuery(suggestion.label);
    setPreview(suggestion);
    setSuggestions([]);
    setOpen(false);
    setSearchError("");
    onSelect(suggestion);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="host-address-layout">
      <div className="host-address-panel">
        <div>
          <label htmlFor="listing-address" className="text-sm font-semibold">Property address</label>
          <p className="mt-1 text-sm leading-6 text-muted">Type the full street address. We’ll find it and place the pin for you.</p>
        </div>
        <div className="relative mt-4">
          <span className="host-address-search__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          </span>
          <input
            id="listing-address"
            required
            autoComplete="street-address"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setSuggestions([]);
              setSearchError("");
              setLoading(false);
              if (selected) {
                onSelect(null);
                setPreview(null);
              } else if (nextQuery.trim().length < 4) {
                setPreview(null);
              }
              setOpen(true);
            }}
            onFocus={() => suggestions.length && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="123 Main Street, Baltimore, MD"
            className="host-input host-address-search__input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={open && suggestions.length ? `${listId}-${activeIndex}` : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "listing-address-error" : "listing-address-help"}
          />
          {loading && <span className="host-address-search__spinner" role="status"><span className="sr-only">Searching addresses</span></span>}

          {open && suggestions.length > 0 && (
            <div id={listId} role="listbox" className="host-address-results">
              {suggestions.map((suggestion, index) => (
                <button
                  id={`${listId}-${index}`}
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                    setPreview(suggestion);
                  }}
                  onClick={() => choose(suggestion)}
                  className={index === activeIndex ? "is-active" : ""}
                >
                  <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
                  <span><strong>{suggestion.label.split(",")[0]}</strong><small>{suggestion.label.split(",").slice(1).join(",").trim()}</small></span>
                </button>
              ))}
              <p>Address data © OpenStreetMap contributors</p>
            </div>
          )}
        </div>

        <div id="listing-address-help" className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="M12 11v6M12 7h.01"/></svg>
          Your street address is used for this preview. The saved guest map uses an approximate pin in the public area shown below.
        </div>
        {(error || searchError) && <p id="listing-address-error" role="alert" className="mt-3 text-sm font-medium text-red-700">{error || searchError}</p>}

        {selected && (
          <div className="host-address-confirmed animate-fade-in">
            <span aria-hidden="true">✓</span>
            <div><strong>Address matched</strong><small>Public area: {selected.publicLocation}</small></div>
          </div>
        )}
      </div>

      <div className="host-location-map-frame">
        <HostLocationMap address={preview} />
      </div>
    </div>
  );
}
