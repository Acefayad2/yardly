"use client";

import { useEffect, useRef } from "react";

// Guards against silently losing in-progress form data to the browser/device Back button.
// While `active` (the form has unsaved changes), the first Back tap is intercepted with a
// native confirm() instead of letting the page unmount straight away. Confirming lets the
// navigation through; cancelling restores the page by re-pushing the same history entry.
// Does not catch an in-app <Link> click elsewhere (would need a much larger navigation-guard
// mechanism) or a closed tab/refresh -- pair with a `beforeunload` listener for those.
export function useConfirmLeave(active: boolean, message: string) {
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!active) return;
    history.pushState({ formGuard: true }, "");

    function onPopState() {
      if (!activeRef.current) return;
      if (window.confirm(message)) {
        activeRef.current = false;
        history.back();
      } else {
        history.pushState({ formGuard: true }, "");
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active, message]);
}
