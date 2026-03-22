/**
 * TanStack Query hooks for project-scoped avatar management (PRD-112).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Avatar, CreateAvatar, UpdateAvatar } from "../types";
import { projectKeys } from "./use-projects";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const projectAvatarKeys = {
  all: (projectId: number) =>
    ["projects", projectId, "avatars"] as const,
  lists: (projectId: number) =>
    [...projectAvatarKeys.all(projectId), "list"] as const,
  detail: (projectId: number, avatarId: number) =>
    [...projectAvatarKeys.all(projectId), "detail", avatarId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all avatars for a project. */
export function useProjectAvatars(projectId: number) {
  return useQuery({
    queryKey: projectAvatarKeys.lists(projectId),
    queryFn: () =>
      api.get<Avatar[]>(`/projects/${projectId}/avatars`),
    enabled: projectId > 0,
    refetchInterval: 15_000,
  });
}

/** Fetch a single avatar within a project. */
export function useAvatar(projectId: number, avatarId: number) {
  return useQuery({
    queryKey: projectAvatarKeys.detail(projectId, avatarId),
    queryFn: () =>
      api.get<Avatar>(
        `/projects/${projectId}/avatars/${avatarId}`,
      ),
    enabled: projectId > 0 && avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new avatar in a project. */
export function useCreateAvatar(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAvatar) =>
      api.post<Avatar>(`/projects/${projectId}/avatars`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectAvatarKeys.all(projectId),
      });
    },
  });
}

/** Bulk-create avatars from a list of names. */
export function useBulkCreateAvatars(projectId: number) {
  return useMutation({
    mutationFn: (data: { names: string[]; group_id?: number }) =>
      api.post<Avatar[]>(
        `/projects/${projectId}/avatars/bulk`,
        data,
      ),
    // NOTE: No onSuccess invalidation — the import flow handles cache
    // invalidation after all phases complete (use-avatar-import.ts).
  });
}

/** Update an existing avatar. */
export function useUpdateAvatar(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      avatarId,
      data,
    }: {
      avatarId: number;
      data: UpdateAvatar;
    }) =>
      api.put<Avatar>(
        `/projects/${projectId}/avatars/${avatarId}`,
        data,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectAvatarKeys.all(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectAvatarKeys.detail(
          projectId,
          variables.avatarId,
        ),
      });
      // Cascade to deliverables, stats, scene assignments
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.stats(projectId) });
      queryClient.invalidateQueries({ queryKey: ["avatar-dashboard"] });
    },
  });
}

/** Toggle a avatar's is_enabled flag. */
export function useToggleAvatarEnabled(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      avatarId,
      isEnabled,
    }: {
      avatarId: number;
      isEnabled: boolean;
    }) =>
      api.put<Avatar>(
        `/projects/${projectId}/avatars/${avatarId}/toggle-enabled`,
        { is_enabled: isEnabled },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectAvatarKeys.all(projectId),
      });
      // Cascade to deliverables and stats (enabled/disabled affects counts)
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
}

/** Delete a avatar. */
export function useDeleteAvatar(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (avatarId: number) =>
      api.delete(`/projects/${projectId}/avatars/${avatarId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectAvatarKeys.all(projectId),
      });
    },
  });
}
