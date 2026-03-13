/**
 * TanStack Query hooks for image-variant-scoped frame annotations.
 *
 * Uses the `/characters/{characterId}/image-variants/{variantId}/annotations` endpoints.
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
  byVariant: (characterId: number, variantId: number) =>
    [...imageVariantAnnotationKeys.all, characterId, variantId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all annotations for an image variant. */
export function useImageVariantAnnotations(characterId: number, variantId: number) {
  return useQuery({
    queryKey: imageVariantAnnotationKeys.byVariant(characterId, variantId),
    queryFn: () =>
      api.get<FrameAnnotation[]>(
        `/characters/${characterId}/image-variants/${variantId}/annotations`,
      ),
    enabled: characterId > 0 && variantId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Upsert annotations for a specific frame on an image variant. */
export function useUpsertImageVariantAnnotation(characterId: number, variantId: number) {
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
        `/characters/${characterId}/image-variants/${variantId}/annotations/${frameNumber}`,
        {
          frame_number: frameNumber,
          annotations_json: annotations,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantAnnotationKeys.byVariant(characterId, variantId),
      });
    },
  });
}

/** Delete all annotations for a specific frame on an image variant. */
export function useDeleteImageVariantFrameAnnotation(characterId: number, variantId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frameNumber: number) =>
      api.delete(
        `/characters/${characterId}/image-variants/${variantId}/annotations/${frameNumber}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantAnnotationKeys.byVariant(characterId, variantId),
      });
    },
  });
}
