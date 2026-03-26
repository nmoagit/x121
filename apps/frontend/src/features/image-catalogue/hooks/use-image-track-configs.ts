/**
 * TanStack Query hooks for per-(image_type, track) workflow & prompt config (PRD-154).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ImageTypeTrackConfig, UpsertImageTrackConfig } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const imageTrackConfigKeys = {
  all: ["image-track-configs"] as const,
  lists: () => [...imageTrackConfigKeys.all, "list"] as const,
  list: (imageTypeId: number) => [...imageTrackConfigKeys.lists(), imageTypeId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all track configs for an image type. */
export function useImageTrackConfigs(imageTypeId: number) {
  return useQuery({
    queryKey: imageTrackConfigKeys.list(imageTypeId),
    queryFn: () =>
      api.get<ImageTypeTrackConfig[]>(`/image-types/${imageTypeId}/track-configs`),
    enabled: imageTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Upsert a track config for a given (image_type, track). */
export function useUpsertImageTrackConfig(imageTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, ...body }: { trackId: number } & UpsertImageTrackConfig) =>
      api.put<ImageTypeTrackConfig>(
        `/image-types/${imageTypeId}/track-configs/${trackId}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageTrackConfigKeys.list(imageTypeId) });
    },
  });
}

/** Delete a track config (revert to image type defaults). */
export function useDeleteImageTrackConfig(imageTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trackId: number) =>
      api.delete(`/image-types/${imageTypeId}/track-configs/${trackId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageTrackConfigKeys.list(imageTypeId) });
    },
  });
}
