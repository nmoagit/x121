/**
 * TanStack Query hooks for track management (PRD-111).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CreateTrack, Track, UpdateTrack } from "../types";

import { sceneCatalogKeys } from "./use-scene-catalog";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const trackKeys = {
  all: ["tracks"] as const,
  lists: () => [...trackKeys.all, "list"] as const,
  list: (includeInactive?: boolean) => [...trackKeys.lists(), { includeInactive }] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all tracks. */
export function useTracks(includeInactive = false) {
  return useQuery({
    queryKey: trackKeys.list(includeInactive),
    queryFn: () => {
      const params = includeInactive ? "?include_inactive=true" : "";
      return api.get<Track[]>(`/tracks${params}`);
    },
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new track. */
export function useCreateTrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrack) => api.post<Track>("/tracks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackKeys.all });
    },
  });
}

/** Update an existing track. */
export function useUpdateTrack(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateTrack) => api.put<Track>(`/tracks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackKeys.all });
      // Track names may appear in catalog entries, so invalidate those too.
      queryClient.invalidateQueries({ queryKey: sceneCatalogKeys.all });
    },
  });
}
