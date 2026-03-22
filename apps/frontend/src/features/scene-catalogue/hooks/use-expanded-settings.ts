/**
 * Hook that annotates scene settings with visual grouping metadata.
 *
 * The backend now returns per-(scene_type, track) rows directly, so no
 * cross-join with the catalogue is needed. This hook just adds `isFirstInGroup`
 * and `groupSize` annotations for table rendering.
 *
 * Used by ProjectSceneSettings, AvatarSceneOverrides, and AvatarScenesTab.
 */

import { useMemo } from "react";

import {
  type EffectiveSceneSetting,
  type ExpandedSceneSetting,
  annotateGroups,
} from "../types";

/**
 * Annotate effective scene settings with group metadata for table display.
 *
 * @param settings - The effective scene settings from any level (project, avatar, etc.)
 * @returns expandedRows (one per scene_type x track) with group annotations
 */
export function useExpandedSettings(
  settings: EffectiveSceneSetting[] | undefined,
): ExpandedSceneSetting[] {
  return useMemo(() => {
    if (!settings) return [];
    return annotateGroups(settings);
  }, [settings]);
}
