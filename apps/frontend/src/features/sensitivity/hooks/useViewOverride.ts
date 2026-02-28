/**
 * Hook for managing per-view blur level overrides (PRD-82).
 */

import { useMemo } from "react";

import { useSensitivity } from "../SensitivityProvider";
import type { BlurLevel } from "../types";
import { BLUR_LEVELS } from "../types";

export function useViewOverride(viewName: string) {
  const { getViewLevel, setViewOverride, adminMinLevel } = useSensitivity();

  const currentLevel = getViewLevel(viewName);

  /** Only levels at or above the admin minimum are selectable. */
  const availableLevels = useMemo(() => {
    const minIndex = BLUR_LEVELS.indexOf(adminMinLevel);
    return BLUR_LEVELS.filter((_, i) => i >= minIndex);
  }, [adminMinLevel]);

  const setLevel = (level: BlurLevel) => setViewOverride(viewName, level);

  return {
    currentLevel,
    availableLevels,
    setLevel,
  };
}
