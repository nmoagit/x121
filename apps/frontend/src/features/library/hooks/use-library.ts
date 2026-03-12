/**
 * Character library TanStack Query hooks (PRD-60).
 *
 * Provides a single hook for fetching all characters across all projects
 * with optional search / scene-type / track filtering.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ImportCharacterRequest,
  LibraryCharacter,
  LibraryUsageEntry,
  ProjectCharacterLink,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

/** Optional filters for the library character list. */
export interface LibraryFilters {
  search?: string;
  sceneTypeId?: number;
  trackId?: number;
}

export const libraryKeys = {
  all: ["library-characters"] as const,
  lists: () => [...libraryKeys.all, "list"] as const,
  list: (filters?: LibraryFilters) => [...libraryKeys.lists(), filters ?? {}] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Build query string from library filters. */
function buildLibraryQueryString(filters?: LibraryFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }
  if (filters.sceneTypeId != null) {
    params.set("scene_type_id", String(filters.sceneTypeId));
  }
  if (filters.trackId != null) {
    params.set("track_id", String(filters.trackId));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch all characters across all projects, with optional filters. */
export function useLibraryCharacters(filters?: LibraryFilters) {
  return useQuery({
    queryKey: libraryKeys.list(filters),
    queryFn: () =>
      api.get<LibraryCharacter[]>(`/library/characters${buildLibraryQueryString(filters)}`),
  });
}

/* --------------------------------------------------------------------------
   Legacy hooks — used by ImportDialog and LibraryUsagePanel
   which still reference the library_characters backend endpoints.
   -------------------------------------------------------------------------- */

/** Fetch cross-project usage for a library character. */
export function useLibraryUsage(id: number) {
  return useQuery({
    queryKey: [...libraryKeys.all, "usage", id] as const,
    queryFn: () => api.get<LibraryUsageEntry[]>(`/library/characters/${id}/usage`),
    enabled: id > 0,
  });
}

/** Import a library character into a project. */
export function useImportToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ libraryId, ...input }: ImportCharacterRequest & { libraryId: number }) =>
      api.post<ProjectCharacterLink>(`/library/characters/${libraryId}/import`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
