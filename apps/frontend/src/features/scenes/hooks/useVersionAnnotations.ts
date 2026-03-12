/**
 * TanStack Query hooks for version-scoped frame annotations (clip review).
 *
 * Uses the `/scenes/{sceneId}/versions/{versionId}/annotations` endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DrawingObject, FrameAnnotation } from "@/features/annotations/types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const versionAnnotationKeys = {
  all: ["version-annotations"] as const,
  byVersion: (sceneId: number, versionId: number) =>
    [...versionAnnotationKeys.all, sceneId, versionId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all annotations for a video version, ordered by frame number. */
export function useVersionAnnotations(sceneId: number, versionId: number) {
  return useQuery({
    queryKey: versionAnnotationKeys.byVersion(sceneId, versionId),
    queryFn: () =>
      api.get<FrameAnnotation[]>(
        `/scenes/${sceneId}/versions/${versionId}/annotations`,
      ),
    enabled: sceneId > 0 && versionId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Upsert annotations for a specific frame on a video version. */
export function useUpsertVersionAnnotation(sceneId: number, versionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      frameNumber,
      annotations,
    }: {
      frameNumber: number;
      annotations: DrawingObject[];
    }) =>
      api.put<FrameAnnotation | null>(
        `/scenes/${sceneId}/versions/${versionId}/annotations/${frameNumber}`,
        {
          frame_number: frameNumber,
          annotations_json: annotations,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: versionAnnotationKeys.byVersion(sceneId, versionId),
      });
    },
  });
}

/** Delete all annotations for a specific frame on a video version. */
export function useDeleteVersionFrameAnnotation(sceneId: number, versionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frameNumber: number) =>
      api.delete(
        `/scenes/${sceneId}/versions/${versionId}/annotations/${frameNumber}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: versionAnnotationKeys.byVersion(sceneId, versionId),
      });
    },
  });
}
