/**
 * TanStack Query hooks for scene catalog entries (PRD-111).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateSceneCatalogEntry,
  SceneCatalogEntry,
  UpdateSceneCatalogEntry,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const sceneCatalogKeys = {
  all: ["scene-catalog"] as const,
  lists: () => [...sceneCatalogKeys.all, "list"] as const,
  list: (includeInactive?: boolean) =>
    [...sceneCatalogKeys.lists(), { includeInactive }] as const,
  details: () => [...sceneCatalogKeys.all, "detail"] as const,
  detail: (id: number) => [...sceneCatalogKeys.details(), id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all scene catalog entries with their tracks. */
export function useSceneCatalog(includeInactive = false) {
  return useQuery({
    queryKey: sceneCatalogKeys.list(includeInactive),
    queryFn: () => {
      const params = includeInactive ? "?include_inactive=true" : "";
      return api.get<SceneCatalogEntry[]>(`/scene-catalog${params}`);
    },
  });
}

/** Fetch a single scene catalog entry by id. */
export function useSceneCatalogEntry(id: number | null) {
  return useQuery({
    queryKey: sceneCatalogKeys.detail(id ?? 0),
    queryFn: () => api.get<SceneCatalogEntry>(`/scene-catalog/${id}`),
    enabled: id !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new scene catalog entry. */
export function useCreateSceneCatalogEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneCatalogEntry) =>
      api.post<SceneCatalogEntry>("/scene-catalog", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogKeys.all });
    },
  });
}

/** Update an existing scene catalog entry. */
export function useUpdateSceneCatalogEntry(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSceneCatalogEntry) =>
      api.put<SceneCatalogEntry>(`/scene-catalog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: sceneCatalogKeys.lists() });
    },
  });
}

/** Deactivate (soft-delete) a scene catalog entry. */
export function useDeactivateSceneCatalogEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/scene-catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneCatalogKeys.all });
    },
  });
}
