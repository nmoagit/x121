/**
 * Hook returning the currently focused panel context (PRD-52).
 *
 * Listens for `focusin` events on elements with a `data-shortcut-context`
 * attribute and tracks the most recently focused context string.
 */

import { useEffect, useState } from "react";

/**
 * Returns the current shortcut context based on DOM focus.
 *
 * Any element with `data-shortcut-context="review-panel"` (for example)
 * will set the context to `"review-panel"` when focused.
 */
export function useActiveContext(): string | null {
  const [context, setContext] = useState<string | null>(null);

  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      // Walk up from focused element to find the nearest context boundary.
      const contextEl = target.closest("[data-shortcut-context]");
      if (contextEl instanceof HTMLElement) {
        setContext(contextEl.dataset.shortcutContext ?? null);
      } else {
        setContext(null);
      }
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  return context;
}
