/**
 * TanStack Query hooks for scene catalogue entries (PRD-111).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CreateSceneCatalogueEntry, SceneCatalogueEntry, UpdateSceneCatalogueEntry } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const sceneCatalogueKeys = {
  all: ["scene-catalogue"] as const,
  lists: () => [...sceneCatalogueKeys.all, "list"] as const,
  list: (includeInactive?: boolean) => [...sceneCatalogueKeys.lists(), { includeInactive }] as const,
  details: () => [...sceneCatalogueKeys.all, "detail"] as const,
  detail: (id: number) => [...sceneCatalogueKeys.details(), id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all scene catalogue entries with their tracks. */
export function useSceneCatalogue(includeInactive = false) {
  return useQuery({
    queryKey: sceneCatalogueKeys.list(includeInactive),
    queryFn: () => {
      const params = includeInactive ? "?include_inactive=true" : "";
      return api.get<SceneCatalogueEntry[]>(`/scene-types/with-tracks${params}`);
    },
  });
}

/** Fetch a single scene catalogue entry by id. */
export function useSceneCatalogueEntry(id: number | null) {
  return useQuery({
    queryKey: sceneCatalogueKeys.detail(id ?? 0),
    queryFn: () => api.get<SceneCatalogueEntry>(`/scene-types/${id}`),
    enabled: id !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new scene catalogue entry. */
export function useCreateSceneCatalogueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneCatalogueEntry) =>
      api.post<SceneCatalogueEntry>("/scene-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogueKeys.all });
    },
  });
}

/** Update an existing scene catalogue entry. */
export function useUpdateSceneCatalogueEntry(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSceneCatalogueEntry) =>
      api.put<SceneCatalogueEntry>(`/scene-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogueKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: sceneCatalogueKeys.lists() });
    },
  });
}

/** Deactivate (soft-delete) a scene catalogue entry. */
export function useDeactivateSceneCatalogueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/scene-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogueKeys.all });
    },
  });
}
