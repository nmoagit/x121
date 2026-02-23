/**
 * Storyboard TanStack Query hooks (PRD-62).
 *
 * Provides hooks for listing, creating, and deleting keyframes
 * used in scene storyboard filmstrips and hover-scrub previews.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { CreateKeyframeRequest, Keyframe } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const storyboardKeys = {
  all: ["storyboard"] as const,
  scene: (sceneId: number) => ["storyboard", "scene", sceneId] as const,
  segment: (segmentId: number) =>
    ["storyboard", "segment", segmentId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all keyframes for a scene's storyboard. */
export function useSceneStoryboard(sceneId: number) {
  return useQuery({
    queryKey: storyboardKeys.scene(sceneId),
    queryFn: () =>
      api.get<Keyframe[]>(`/scenes/${sceneId}/storyboard`),
    enabled: sceneId > 0,
  });
}

/** Fetch keyframes for a specific segment. */
export function useSegmentKeyframes(segmentId: number) {
  return useQuery({
    queryKey: storyboardKeys.segment(segmentId),
    queryFn: () =>
      api.get<Keyframe[]>(`/keyframes/segment/${segmentId}`),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new keyframe record. */
export function useCreateKeyframe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateKeyframeRequest) =>
      api.post<Keyframe>("/keyframes", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: storyboardKeys.segment(variables.segment_id),
      });
      // Also invalidate scene-level queries since we don't know the scene id here.
      queryClient.invalidateQueries({
        queryKey: storyboardKeys.all,
      });
    },
  });
}

/** Delete all keyframes for a segment (for re-extraction). */
export function useDeleteSegmentKeyframes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (segmentId: number) =>
      api.delete(`/keyframes/segment/${segmentId}`),
    onSuccess: (_data, segmentId) => {
      queryClient.invalidateQueries({
        queryKey: storyboardKeys.segment(segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: storyboardKeys.all,
      });
    },
  });
}
