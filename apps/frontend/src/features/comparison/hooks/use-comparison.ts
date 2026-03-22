/**
 * TanStack Query hooks for cross-avatar scene comparison (PRD-68).
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
  avatar: (projectId: number, avatarId: number) =>
    [...comparisonKeys.all, "avatar", projectId, avatarId] as const,
};

/* --------------------------------------------------------------------------
   Scene-type comparison (one cell per avatar)
   -------------------------------------------------------------------------- */

/**
 * Fetches comparison cells for a single scene type across all avatars.
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
   Avatar all-scenes (one cell per scene type)
   -------------------------------------------------------------------------- */

/**
 * Fetches all scene-type cells for a single avatar.
 *
 * GET /api/v1/projects/{projectId}/avatars/{avatarId}/all-scenes
 */
export function useAvatarAllScenes(
  projectId: number,
  avatarId: number,
) {
  return useQuery({
    queryKey: comparisonKeys.avatar(projectId, avatarId),
    queryFn: () =>
      api.get<ComparisonCell[]>(
        `/projects/${projectId}/avatars/${avatarId}/all-scenes`,
      ),
    enabled: projectId > 0 && avatarId > 0,
  });
}
