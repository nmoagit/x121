/**
 * Updates the browser tab title with job progress when the tab is not focused.
 *
 * When the user switches to another tab/app, the title shows a progress
 * indicator so they can track generation from the OS taskbar.
 *
 * Format: "[73%] Trulience — Generating..."
 * Reverts to "Trulience" when all jobs finish or tab regains focus.
 */

import { useEffect, useRef, useState } from "react";
import { useJobStatusAggregator } from "./useJobStatusAggregator";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_TITLE = "Trulience";

/* --------------------------------------------------------------------------
   Tab focus detection
   -------------------------------------------------------------------------- */

function useTabFocus(): boolean {
  const [focused, setFocused] = useState(!document.hidden);

  useEffect(() => {
    function onVisibilityChange() {
      setFocused(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return focused;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useTabTitleProgress(): void {
  const summary = useJobStatusAggregator();
  const isTabFocused = useTabFocus();
  const originalTitleRef = useRef(document.title);

  useEffect(() => {
    // Capture the original title on first mount
    originalTitleRef.current = DEFAULT_TITLE;
  }, []);

  useEffect(() => {
    if (!isTabFocused && summary.runningCount > 0) {
      const firstRunning = summary.jobs.find((j) => j.status === "running");
      const label = firstRunning ? firstRunning.name : "Generating";
      document.title = `[${summary.overallProgress}%] ${DEFAULT_TITLE} — ${label}...`;
    } else {
      document.title = originalTitleRef.current;
    }

    return () => {
      document.title = originalTitleRef.current;
    };
  }, [isTabFocused, summary.runningCount, summary.overallProgress, summary.jobs]);
}
