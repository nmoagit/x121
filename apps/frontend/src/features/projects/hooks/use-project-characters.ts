/**
 * TanStack Query hooks for project-scoped character management (PRD-112).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Character, CreateCharacter, UpdateCharacter } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const projectCharacterKeys = {
  all: (projectId: number) =>
    ["projects", projectId, "characters"] as const,
  lists: (projectId: number) =>
    [...projectCharacterKeys.all(projectId), "list"] as const,
  detail: (projectId: number, characterId: number) =>
    [...projectCharacterKeys.all(projectId), "detail", characterId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all characters for a project. */
export function useProjectCharacters(projectId: number) {
  return useQuery({
    queryKey: projectCharacterKeys.lists(projectId),
    queryFn: () =>
      api.get<Character[]>(`/projects/${projectId}/characters`),
    enabled: projectId > 0,
  });
}

/** Fetch a single character within a project. */
export function useCharacter(projectId: number, characterId: number) {
  return useQuery({
    queryKey: projectCharacterKeys.detail(projectId, characterId),
    queryFn: () =>
      api.get<Character>(
        `/projects/${projectId}/characters/${characterId}`,
      ),
    enabled: projectId > 0 && characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new character in a project. */
export function useCreateCharacter(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCharacter) =>
      api.post<Character>(`/projects/${projectId}/characters`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectCharacterKeys.all(projectId),
      });
    },
  });
}

/** Bulk-create characters from a list of names. */
export function useBulkCreateCharacters(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { names: string[]; group_id?: number }) =>
      api.post<Character[]>(
        `/projects/${projectId}/characters/bulk`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectCharacterKeys.all(projectId),
      });
    },
  });
}

/** Update an existing character. */
export function useUpdateCharacter(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      characterId,
      data,
    }: {
      characterId: number;
      data: UpdateCharacter;
    }) =>
      api.put<Character>(
        `/projects/${projectId}/characters/${characterId}`,
        data,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectCharacterKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectCharacterKeys.detail(
          projectId,
          variables.characterId,
        ),
      });
    },
  });
}

/** Delete a character. */
export function useDeleteCharacter(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (characterId: number) =>
      api.delete(`/projects/${projectId}/characters/${characterId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectCharacterKeys.all(projectId),
      });
    },
  });
}
