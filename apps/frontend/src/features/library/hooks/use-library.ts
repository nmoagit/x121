/**
 * Avatar library TanStack Query hooks (PRD-60).
 *
 * Provides a single hook for fetching all avatars across all projects
 * with optional search / scene-type / track filtering.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ImportAvatarRequest,
  LibraryAvatar,
  LibraryUsageEntry,
  ProjectAvatarLink,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

/** Optional filters for the library avatar list. */
export interface LibraryFilters {
  search?: string;
  sceneTypeId?: number;
  trackId?: number;
  pipelineId?: number;
}

export const libraryKeys = {
  all: ["library-avatars"] as const,
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
  if (filters.pipelineId != null) {
    params.set("pipeline_id", String(filters.pipelineId));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch all avatars across all projects, with optional filters. */
export function useLibraryAvatars(filters?: LibraryFilters) {
  return useQuery({
    queryKey: libraryKeys.list(filters),
    queryFn: () =>
      api.get<LibraryAvatar[]>(`/library/avatars${buildLibraryQueryString(filters)}`),
  });
}

/* --------------------------------------------------------------------------
   Legacy hooks — used by ImportDialog and LibraryUsagePanel
   which still reference the library_avatars backend endpoints.
   -------------------------------------------------------------------------- */

/** Fetch cross-project usage for a library avatar. */
export function useLibraryUsage(id: number) {
  return useQuery({
    queryKey: [...libraryKeys.all, "usage", id] as const,
    queryFn: () => api.get<LibraryUsageEntry[]>(`/library/avatars/${id}/usage`),
    enabled: id > 0,
  });
}

/** Import a library avatar into a project. */
export function useImportToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ libraryId, ...input }: ImportAvatarRequest & { libraryId: number }) =>
      api.post<ProjectAvatarLink>(`/library/avatars/${libraryId}/import`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
