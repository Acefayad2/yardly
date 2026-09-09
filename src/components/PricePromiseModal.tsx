"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "yardly-price-promise-seen-v1";

export default function PricePromiseModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // The announcement can still be dismissed for this page view when storage is unavailable.
    }

    if (!dismissed) queueMicrotask(() => setOpen(true));
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-primary-action]")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Closing the dialog should never depend on storage access.
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="price-promise-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        className="price-promise-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-promise-title"
        aria-describedby="price-promise-description"
      >
        <button type="button" className="price-promise-close" onClick={dismiss} aria-label="Close price announcement">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <div className="price-promise-visual" aria-hidden="true">
          <span className="price-promise-tag price-promise-tag--back" />
          <span className="price-promise-tag price-promise-tag--front">
            <svg viewBox="0 0 48 48"><path d="M10 7h17l14 14-20 20L7 27V10a3 3 0 0 1 3-3Z" /><circle cx="17" cy="17" r="4" /></svg>
          </span>
          <span className="price-promise-spark price-promise-spark--one" />
          <span className="price-promise-spark price-promise-spark--two" />
        </div>

        <p className="price-promise-eyebrow">Clear pricing, from the start</p>
        <h2 id="price-promise-title">One clear total for your Yardly time.</h2>
        <p id="price-promise-description">Your hourly rate and Yardly service fee are shown together before you reserve.</p>

        <button type="button" className="price-promise-action" onClick={dismiss} data-primary-action>
          Got it
        </button>
      </div>
    </div>
  );
}
