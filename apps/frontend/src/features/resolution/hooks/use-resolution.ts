/**
 * TanStack Query hooks for the Multi-Resolution Pipeline feature (PRD-59).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ResolutionTier,
  UpscaleRequest,
  UpscaleResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const resolutionKeys = {
  all: ["resolution"] as const,
  tiers: () => [...resolutionKeys.all, "tiers"] as const,
  tier: (id: number) => [...resolutionKeys.all, "tier", id] as const,
  sceneTier: (sceneId: number) =>
    [...resolutionKeys.all, "scene-tier", sceneId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List all resolution tiers. Rarely changes, so uses a long stale time. */
export function useResolutionTiers() {
  return useQuery({
    queryKey: resolutionKeys.tiers(),
    queryFn: () => api.get<ResolutionTier[]>("/resolution-tiers"),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/** Fetch a single resolution tier by ID. */
export function useResolutionTier(id: number) {
  return useQuery({
    queryKey: resolutionKeys.tier(id),
    queryFn: () => api.get<ResolutionTier>(`/resolution-tiers/${id}`),
    enabled: id > 0,
    staleTime: 10 * 60 * 1000,
  });
}

/** Fetch the current resolution tier for a scene. */
export function useSceneTier(sceneId: number) {
  return useQuery({
    queryKey: resolutionKeys.sceneTier(sceneId),
    queryFn: () =>
      api.get<ResolutionTier>(`/scenes/${sceneId}/tier`),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Upscale a scene to a higher resolution tier. */
export function useUpscaleScene(sceneId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpscaleRequest) =>
      api.post<UpscaleResponse>(`/scenes/${sceneId}/upscale`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}
