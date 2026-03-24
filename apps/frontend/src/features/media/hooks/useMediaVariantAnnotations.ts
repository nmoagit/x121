/**
 * TanStack Query hooks for media-variant-scoped frame annotations.
 *
 * Uses the `/avatars/{avatarId}/media-variants/{variantId}/annotations` endpoints.
 * Media variants are static images so annotations always target frame 0.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DrawingObject, FrameAnnotation } from "@/features/annotations/types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const mediaVariantAnnotationKeys = {
  all: ["media-variant-annotations"] as const,
  byVariant: (avatarId: number, variantId: number) =>
    [...mediaVariantAnnotationKeys.all, avatarId, variantId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all annotations for an media variant. */
export function useMediaVariantAnnotations(avatarId: number, variantId: number) {
  return useQuery({
    queryKey: mediaVariantAnnotationKeys.byVariant(avatarId, variantId),
    queryFn: () =>
      api.get<FrameAnnotation[]>(
        `/avatars/${avatarId}/media-variants/${variantId}/annotations`,
      ),
    enabled: avatarId > 0 && variantId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Upsert annotations for a specific frame on an media variant. */
export function useUpsertMediaVariantAnnotation(avatarId: number, variantId: number) {
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
        `/avatars/${avatarId}/media-variants/${variantId}/annotations/${frameNumber}`,
        {
          frame_number: frameNumber,
          annotations_json: annotations,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: mediaVariantAnnotationKeys.byVariant(avatarId, variantId),
      });
    },
  });
}

/** Delete all annotations for a specific frame on an media variant. */
export function useDeleteMediaVariantFrameAnnotation(avatarId: number, variantId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frameNumber: number) =>
      api.delete(
        `/avatars/${avatarId}/media-variants/${variantId}/annotations/${frameNumber}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: mediaVariantAnnotationKeys.byVariant(avatarId, variantId),
      });
    },
  });
}
