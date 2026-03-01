/**
 * TanStack Query hooks for character group management (PRD-112).
 *
 * Groups allow organizing characters within a project.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterGroup,
  CreateCharacterGroup,
  UpdateCharacterGroup,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const characterGroupKeys = {
  all: (projectId: number) => ["projects", projectId, "groups"] as const,
  lists: (projectId: number) =>
    [...characterGroupKeys.all(projectId), "list"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all character groups for a project. */
export function useCharacterGroups(projectId: number) {
  return useQuery({
    queryKey: characterGroupKeys.lists(projectId),
    queryFn: () =>
      api.get<CharacterGroup[]>(`/projects/${projectId}/groups`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new character group. */
export function useCreateGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCharacterGroup) =>
      api.post<CharacterGroup>(`/projects/${projectId}/groups`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterGroupKeys.all(projectId),
      });
    },
  });
}

/** Update an existing character group. */
export function useUpdateGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: UpdateCharacterGroup }) =>
      api.put<CharacterGroup>(
        `/projects/${projectId}/groups/${groupId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterGroupKeys.all(projectId),
      });
    },
  });
}

/** Delete a character group. */
export function useDeleteGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: number) =>
      api.delete(`/projects/${projectId}/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterGroupKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "characters"],
      });
    },
  });
}

/** Move a character to a different group. */
export function useMoveCharacterToGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      characterId,
      groupId,
    }: {
      characterId: number;
      groupId: number | null;
    }) =>
      api.put(`/projects/${projectId}/characters/${characterId}/group`, {
        group_id: groupId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterGroupKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "characters"],
      });
    },
  });
}
