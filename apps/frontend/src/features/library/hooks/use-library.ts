/**
 * Character library TanStack Query hooks (PRD-60).
 *
 * Provides hooks for fetching, creating, updating, and importing
 * library characters, as well as managing project-character links.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateLibraryCharacter,
  ImportCharacterRequest,
  LibraryCharacter,
  LibraryUsageEntry,
  ProjectCharacterLink,
  UpdateLibraryCharacter,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

/** Optional filters for the library character list. */
export interface LibraryFilters {
  sceneTypeIds?: number[];
  trackIds?: number[];
}

export const libraryKeys = {
  all: ["library-characters"] as const,
  lists: () => [...libraryKeys.all, "list"] as const,
  list: (filters?: LibraryFilters) => [...libraryKeys.lists(), filters ?? {}] as const,
  detail: (id: number) => [...libraryKeys.all, "detail", id] as const,
  usage: (id: number) => [...libraryKeys.all, "usage", id] as const,
  projectLinks: (projectId: number) => [...libraryKeys.all, "project-links", projectId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Build query string from library filters. */
function buildLibraryQueryString(filters?: LibraryFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.sceneTypeIds?.length) {
    params.set("scene_type_ids", filters.sceneTypeIds.join(","));
  }
  if (filters.trackIds?.length) {
    params.set("track_ids", filters.trackIds.join(","));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch all library characters visible to the current user, with optional filters. */
export function useLibraryCharacters(filters?: LibraryFilters) {
  return useQuery({
    queryKey: libraryKeys.list(filters),
    queryFn: () =>
      api.get<LibraryCharacter[]>(`/library/characters${buildLibraryQueryString(filters)}`),
  });
}

/** Fetch a single library character by ID. */
export function useLibraryCharacter(id: number) {
  return useQuery({
    queryKey: libraryKeys.detail(id),
    queryFn: () => api.get<LibraryCharacter>(`/library/characters/${id}`),
    enabled: id > 0,
  });
}

/** Fetch cross-project usage for a library character. */
export function useLibraryUsage(id: number) {
  return useQuery({
    queryKey: libraryKeys.usage(id),
    queryFn: () => api.get<LibraryUsageEntry[]>(`/library/characters/${id}/usage`),
    enabled: id > 0,
  });
}

/** Fetch all library-character links for a project. */
export function useProjectLinks(projectId: number) {
  return useQuery({
    queryKey: libraryKeys.projectLinks(projectId),
    queryFn: () =>
      api.get<ProjectCharacterLink[]>(`/library/characters/projects/${projectId}/links`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new library character. */
export function useCreateLibraryCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLibraryCharacter) =>
      api.post<LibraryCharacter>("/library/characters", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.lists() });
    },
  });
}

/** Update an existing library character. */
export function useUpdateLibraryCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateLibraryCharacter & { id: number }) =>
      api.put<LibraryCharacter>(`/library/characters/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: libraryKeys.detail(variables.id),
      });
    },
  });
}

/** Delete a library character. */
export function useDeleteLibraryCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/library/characters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.lists() });
    },
  });
}

/** Import a library character into a project. */
export function useImportToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ libraryId, ...input }: ImportCharacterRequest & { libraryId: number }) =>
      api.post<ProjectCharacterLink>(`/library/characters/${libraryId}/import`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: libraryKeys.usage(variables.libraryId),
      });
      queryClient.invalidateQueries({
        queryKey: libraryKeys.projectLinks(variables.project_id),
      });
    },
  });
}

/** Update linked fields on an existing link. */
export function useUpdateLinkFields() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      linkId,
      linkedFields,
    }: {
      linkId: number;
      linkedFields: string[];
      projectId: number;
    }) => api.put<ProjectCharacterLink>(`/library/characters/links/${linkId}`, linkedFields),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: libraryKeys.projectLinks(variables.projectId),
      });
    },
  });
}

/** Delete a project-character link. */
export function useDeleteLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      linkId,
    }: {
      linkId: number;
      projectId: number;
    }) => api.delete(`/library/characters/links/${linkId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: libraryKeys.projectLinks(variables.projectId),
      });
    },
  });
}
