/**
 * Hook that cross-joins scene settings with catalog tracks.
 *
 * Encapsulates the repeated pattern:
 *   useMemo(() => expandSettingsWithTracks(settings, catalog), [settings, catalog])
 *
 * Used by ProjectSceneSettings, CharacterSceneOverrides, and CharacterScenesTab.
 */

import { useMemo } from "react";

import {
  type EffectiveSceneSetting,
  type ExpandedSceneSetting,
  expandSettingsWithTracks,
} from "../types";
import { useSceneCatalog } from "./use-scene-catalog";

interface UseExpandedSettingsResult {
  expandedRows: ExpandedSceneSetting[];
  catalogLoading: boolean;
}

/**
 * Expand effective scene settings with track data from the catalog.
 *
 * @param settings - The effective scene settings from any level (project, character, etc.)
 * @returns expandedRows (one per scene_type x active track) and loading state for the catalog
 */
export function useExpandedSettings(
  settings: EffectiveSceneSetting[] | undefined,
): UseExpandedSettingsResult {
  const { data: catalog, isLoading: catalogLoading } = useSceneCatalog();

  const expandedRows = useMemo(() => {
    if (!settings || !catalog) return [];
    return expandSettingsWithTracks(settings, catalog);
  }, [settings, catalog]);

  return { expandedRows, catalogLoading };
}
