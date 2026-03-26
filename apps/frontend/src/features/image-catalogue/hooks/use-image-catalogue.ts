/**
 * TanStack Query hooks for image catalogue entries (PRD-154).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CreateImageType, ImageType, UpdateImageType } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const imageCatalogueKeys = {
  all: ["image-catalogue"] as const,
  lists: () => [...imageCatalogueKeys.all, "list"] as const,
  list: (pipelineId?: number) => [...imageCatalogueKeys.lists(), { pipelineId }] as const,
  details: () => [...imageCatalogueKeys.all, "detail"] as const,
  detail: (id: number) => [...imageCatalogueKeys.details(), id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all image types for a pipeline. */
export function useImageTypes(pipelineId?: number) {
  return useQuery({
    queryKey: imageCatalogueKeys.list(pipelineId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (pipelineId != null) params.set("pipeline_id", String(pipelineId));
      const qs = params.toString();
      return api.get<ImageType[]>(`/image-types${qs ? `?${qs}` : ""}`);
    },
    enabled: pipelineId != null,
  });
}

/** Fetch a single image type by id. */
export function useImageType(id: number | null) {
  return useQuery({
    queryKey: imageCatalogueKeys.detail(id ?? 0),
    queryFn: () => api.get<ImageType>(`/image-types/${id}`),
    enabled: id !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new image type. */
export function useCreateImageType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateImageType) =>
      api.post<ImageType>("/image-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageCatalogueKeys.all });
    },
  });
}

/** Update an existing image type. */
export function useUpdateImageType(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateImageType) =>
      api.put<ImageType>(`/image-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageCatalogueKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: imageCatalogueKeys.lists() });
    },
  });
}

/** Deactivate (soft-delete) an image type. */
export function useDeleteImageType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/image-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: imageCatalogueKeys.all });
    },
  });
}
