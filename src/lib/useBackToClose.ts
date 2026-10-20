"use client";

import { useEffect, useRef } from "react";

// Standard mobile-web pattern for dismissing a sheet/modal with the Back button: push one
// synthetic history entry while the surface is open so the *first* Back tap is absorbed by
// closing it (via popstate) rather than navigating the page underneath away while it stays
// visually open.
//
// Deliberately one-directional: closing the surface any other way (X button, Escape,
// backdrop, a successful action) does NOT try to pop that synthetic entry back off. An
// earlier version did, but popping programmatically raced the app's own router when closing
// was bundled with a real navigation in the same event (e.g. a search submit, or a <Link
// onClick={close}>) -- Next's router.push lands asynchronously, and calling history.back()
// before it lands silently undid the navigation. The accepted cost of not popping is minor:
// occasionally one extra, harmless same-URL Back tap before a real one takes effect.
export function useBackToClose(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    if (!active) return;
    history.pushState({ backToClose: true }, "");

    function onPopState() {
      onBackRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);
}
