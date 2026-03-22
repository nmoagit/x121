/**
 * TanStack Query hooks for avatar group management (PRD-112).
 *
 * Groups allow organizing avatars within a project.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AvatarGroup,
  CreateAvatarGroup,
  UpdateAvatarGroup,
} from "../types";
import { projectKeys } from "./use-projects";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const avatarGroupKeys = {
  all: (projectId: number) => ["projects", projectId, "groups"] as const,
  lists: (projectId: number) =>
    [...avatarGroupKeys.all(projectId), "list"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all avatar groups for a project. */
export function useAvatarGroups(projectId: number) {
  return useQuery({
    queryKey: avatarGroupKeys.lists(projectId),
    queryFn: () =>
      api.get<AvatarGroup[]>(`/projects/${projectId}/groups`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new avatar group. */
export function useCreateGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAvatarGroup) =>
      api.post<AvatarGroup>(`/projects/${projectId}/groups`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarGroupKeys.all(projectId),
      });
    },
  });
}

/** Update an existing avatar group. */
export function useUpdateGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: UpdateAvatarGroup }) =>
      api.put<AvatarGroup>(
        `/projects/${projectId}/groups/${groupId}`,
        data,
      ),
    onSuccess: (updated) => {
      // Optimistically patch the group in the cache so dependent UI updates immediately.
      queryClient.setQueryData<AvatarGroup[]>(
        avatarGroupKeys.lists(projectId),
        (old) => old?.map((g) => (g.id === updated.id ? updated : g)),
      );
      queryClient.invalidateQueries({
        queryKey: avatarGroupKeys.all(projectId),
      });
      // Cascade to deliverables, stats, scene assignments
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
}

/** Delete a avatar group. */
export function useDeleteGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: number) =>
      api.delete(`/projects/${projectId}/groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarGroupKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "avatars"],
      });
    },
  });
}

/** Move a avatar to a different group. */
export function useMoveAvatarToGroup(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      avatarId,
      groupId,
    }: {
      avatarId: number;
      groupId: number | null;
    }) =>
      api.put(`/projects/${projectId}/avatars/${avatarId}/group`, {
        group_id: groupId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarGroupKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "avatars"],
      });
    },
  });
}
