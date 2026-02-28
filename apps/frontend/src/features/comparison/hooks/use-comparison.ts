/**
 * TanStack Query hooks for cross-character scene comparison (PRD-68).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { ComparisonCell, ComparisonResponse } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const comparisonKeys = {
  all: ["comparison"] as const,
  sceneType: (projectId: number, sceneTypeId: number, variantId?: number) =>
    [...comparisonKeys.all, "scene-type", projectId, sceneTypeId, variantId] as const,
  character: (projectId: number, characterId: number) =>
    [...comparisonKeys.all, "character", projectId, characterId] as const,
};

/* --------------------------------------------------------------------------
   Scene-type comparison (one cell per character)
   -------------------------------------------------------------------------- */

/**
 * Fetches comparison cells for a single scene type across all characters.
 *
 * GET /api/v1/projects/{projectId}/scene-comparison
 *   ?scene_type_id={sceneTypeId}
 *   &variant_id={variantId}
 */
export function useSceneComparison(
  projectId: number,
  sceneTypeId: number,
  variantId?: number,
) {
  const params = new URLSearchParams();
  params.set("scene_type_id", String(sceneTypeId));
  if (variantId !== undefined) {
    params.set("variant_id", String(variantId));
  }

  return useQuery({
    queryKey: comparisonKeys.sceneType(projectId, sceneTypeId, variantId),
    queryFn: () =>
      api.get<ComparisonResponse>(
        `/projects/${projectId}/scene-comparison?${params.toString()}`,
      ),
    enabled: projectId > 0 && sceneTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Character all-scenes (one cell per scene type)
   -------------------------------------------------------------------------- */

/**
 * Fetches all scene-type cells for a single character.
 *
 * GET /api/v1/projects/{projectId}/characters/{characterId}/all-scenes
 */
export function useCharacterAllScenes(
  projectId: number,
  characterId: number,
) {
  return useQuery({
    queryKey: comparisonKeys.character(projectId, characterId),
    queryFn: () =>
      api.get<ComparisonCell[]>(
        `/projects/${projectId}/characters/${characterId}/all-scenes`,
      ),
    enabled: projectId > 0 && characterId > 0,
  });
}
