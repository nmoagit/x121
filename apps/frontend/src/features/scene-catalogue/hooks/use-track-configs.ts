/**
 * TanStack Query hooks for per-(scene_type, track) workflow & prompt config.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { SceneTypeTrackConfig, Track, UpsertTrackConfig } from "../types";

import { sceneTypeKeys } from "@/features/scene-types/hooks/use-scene-types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const trackConfigKeys = {
  all: ["track-configs"] as const,
  lists: () => [...trackConfigKeys.all, "list"] as const,
  list: (sceneTypeId: number) => [...trackConfigKeys.lists(), sceneTypeId] as const,
  detail: (sceneTypeId: number, trackId: number) =>
    [...trackConfigKeys.all, "detail", sceneTypeId, trackId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all track configs for a scene type. */
export function useTrackConfigs(sceneTypeId: number) {
  return useQuery({
    queryKey: trackConfigKeys.list(sceneTypeId),
    queryFn: () =>
      api.get<SceneTypeTrackConfig[]>(`/scene-types/${sceneTypeId}/track-configs`),
    enabled: sceneTypeId > 0,
  });
}

/** Fetch the tracks associated with a given scene type. */
export function useSceneTypeTracks(sceneTypeId: number) {
  return useQuery({
    queryKey: [...sceneTypeKeys.detail(sceneTypeId), "tracks"] as const,
    queryFn: () => api.get<Track[]>(`/scene-types/${sceneTypeId}/tracks`),
    enabled: sceneTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Upsert a track config for a given (scene_type, track). */
export function useUpsertTrackConfig(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, ...body }: { trackId: number } & UpsertTrackConfig) =>
      api.put<SceneTypeTrackConfig>(
        `/scene-types/${sceneTypeId}/track-configs/${trackId}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackConfigKeys.list(sceneTypeId) });
    },
  });
}

/** Delete a track config (revert to scene type default). */
export function useDeleteTrackConfig(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, isClothesOff = false }: { trackId: number; isClothesOff?: boolean }) => {
      const params = isClothesOff ? "?is_clothes_off=true" : "";
      return api.delete(`/scene-types/${sceneTypeId}/track-configs/${trackId}${params}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackConfigKeys.list(sceneTypeId) });
    },
  });
}
