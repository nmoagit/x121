/**
 * Responsive breakpoint detection hook (PRD-55).
 *
 * Uses `window.matchMedia` for efficient media-query-based detection
 * rather than polling window dimensions.
 */

import { useEffect, useState } from "react";

import { BREAKPOINT_PHONE, BREAKPOINT_TABLET } from "../types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type Breakpoint = "phone" | "tablet" | "desktop";

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => getBreakpoint());

  useEffect(() => {
    const tabletQuery = window.matchMedia(`(min-width: ${BREAKPOINT_PHONE}px)`);
    const desktopQuery = window.matchMedia(`(min-width: ${BREAKPOINT_TABLET}px)`);

    function update() {
      if (desktopQuery.matches) {
        setBreakpoint("desktop");
      } else if (tabletQuery.matches) {
        setBreakpoint("tablet");
      } else {
        setBreakpoint("phone");
      }
    }

    // Set initial value
    update();

    tabletQuery.addEventListener("change", update);
    desktopQuery.addEventListener("change", update);

    return () => {
      tabletQuery.removeEventListener("change", update);
      desktopQuery.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "phone";
  const width = window.innerWidth;
  if (width >= BREAKPOINT_TABLET) return "desktop";
  if (width >= BREAKPOINT_PHONE) return "tablet";
  return "phone";
}
