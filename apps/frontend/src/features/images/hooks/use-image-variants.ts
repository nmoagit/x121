/**
 * TanStack Query hooks for image variant management (PRD-21).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateImageVariantInput,
  GenerateVariantsInput,
  ImageVariant,
  UpdateImageVariantInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const imageVariantKeys = {
  all: ["image-variants"] as const,
  lists: () => [...imageVariantKeys.all, "list"] as const,
  list: (characterId: number, variantType?: string) =>
    [...imageVariantKeys.lists(), characterId, variantType] as const,
  details: () => [...imageVariantKeys.all, "detail"] as const,
  detail: (characterId: number, id: number) =>
    [...imageVariantKeys.details(), characterId, id] as const,
  histories: () => [...imageVariantKeys.all, "history"] as const,
  history: (characterId: number, id: number) =>
    [...imageVariantKeys.histories(), characterId, id] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function variantBasePath(characterId: number): string {
  return `/characters/${characterId}/image-variants`;
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all image variants for a character, optionally filtered by variant type. */
export function useImageVariants(characterId: number, variantType?: string) {
  const params = variantType ? `?variant_type=${encodeURIComponent(variantType)}` : "";
  return useQuery({
    queryKey: imageVariantKeys.list(characterId, variantType),
    queryFn: () =>
      api.get<ImageVariant[]>(`${variantBasePath(characterId)}${params}`),
    enabled: characterId > 0,
  });
}

/** Fetch a single image variant by id. */
export function useImageVariant(characterId: number, id: number | null) {
  return useQuery({
    queryKey: imageVariantKeys.detail(characterId, id ?? 0),
    queryFn: () =>
      api.get<ImageVariant>(`${variantBasePath(characterId)}/${id}`),
    enabled: id !== null && characterId > 0,
  });
}

/** Fetch the version history chain for a variant. */
export function useVariantHistory(characterId: number, id: number | null) {
  return useQuery({
    queryKey: imageVariantKeys.history(characterId, id ?? 0),
    queryFn: () =>
      api.get<ImageVariant[]>(`${variantBasePath(characterId)}/${id}/history`),
    enabled: id !== null && characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new image variant via JSON. */
export function useCreateImageVariant(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateImageVariantInput) =>
      api.post<ImageVariant>(variantBasePath(characterId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.lists() });
    },
  });
}

/** Update an existing image variant. */
export function useUpdateImageVariant(characterId: number, id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateImageVariantInput) =>
      api.put<ImageVariant>(`${variantBasePath(characterId)}/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: imageVariantKeys.detail(characterId, id),
      });
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.lists() });
    },
  });
}

/** Soft-delete an image variant. */
export function useDeleteImageVariant(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`${variantBasePath(characterId)}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.lists() });
    },
  });
}

/** Approve a variant as hero for its character+variant_type. */
export function useApproveVariant(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(characterId)}/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Reject a variant. */
export function useRejectVariant(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(characterId)}/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Export a variant for external editing. */
export function useExportVariant(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ImageVariant>(`${variantBasePath(characterId)}/${id}/export`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.all });
    },
  });
}

/** Generate variants via ComfyUI. */
export function useGenerateVariants(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateVariantsInput) =>
      api.post<ImageVariant[]>(
        `${variantBasePath(characterId)}/generate`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageVariantKeys.lists() });
    },
  });
}
