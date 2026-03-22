/**
 * TanStack Query hooks for image-variant-scoped frame annotations.
 *
 * Uses the `/avatars/{avatarId}/image-variants/{variantId}/annotations` endpoints.
 * Image variants are static images so annotations always target frame 0.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DrawingObject, FrameAnnotation } from "@/features/annotations/types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const imageVariantAnnotationKeys = {
  all: ["image-variant-annotations"] as const,
  byVariant: (avatarId: number, variantId: number) =>
    [...imageVariantAnnotationKeys.all, avatarId, variantId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all annotations for an image variant. */
export function useImageVariantAnnotations(avatarId: number, variantId: number) {
  return useQuery({
    queryKey: imageVariantAnnotationKeys.byVariant(avatarId, variantId),
    queryFn: () =>
      api.get<FrameAnnotation[]>(
        `/avatars/${avatarId}/image-variants/${variantId}/annotations`,
      ),
    enabled: avatarId > 0 && variantId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Upsert annotations for a specific frame on an image variant. */
export function useUpsertImageVariantAnnotation(avatarId: number, variantId: number) {
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
        `/avatars/${avatarId}/image-variants/${variantId}/annotations/${frameNumber}`,
        {
          frame_number: frameNumber,
          annotations_json: annotations,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantAnnotationKeys.byVariant(avatarId, variantId),
      });
    },
  });
}

/** Delete all annotations for a specific frame on an image variant. */
export function useDeleteImageVariantFrameAnnotation(avatarId: number, variantId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frameNumber: number) =>
      api.delete(
        `/avatars/${avatarId}/image-variants/${variantId}/annotations/${frameNumber}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantAnnotationKeys.byVariant(avatarId, variantId),
      });
    },
  });
}
