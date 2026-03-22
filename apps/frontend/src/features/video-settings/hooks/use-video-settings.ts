/**
 * TanStack Query hooks for hierarchical video settings overrides.
 *
 * Mirrors the prompt-management hook pattern: query key factory,
 * query hooks per level, and upsert/delete mutations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ResolvedVideoSettings, VideoSettingsOverride } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const videoSettingsKeys = {
  all: ["video-settings"] as const,
  sceneType: (sceneTypeId: number) =>
    [...videoSettingsKeys.all, "scene-type", sceneTypeId] as const,
  project: (projectId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "project", projectId, sceneTypeId] as const,
  projectList: (projectId: number) =>
    [...videoSettingsKeys.all, "project-list", projectId] as const,
  group: (groupId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "group", groupId, sceneTypeId] as const,
  groupList: (groupId: number) =>
    [...videoSettingsKeys.all, "group-list", groupId] as const,
  avatar: (avatarId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "avatar", avatarId, sceneTypeId] as const,
  avatarList: (avatarId: number) =>
    [...videoSettingsKeys.all, "avatar-list", avatarId] as const,
  resolved: (avatarId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "resolved", avatarId, sceneTypeId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch video settings overrides for a project + scene type. */
export function useProjectVideoSettings(projectId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.project(projectId, sceneTypeId),
    queryFn: () =>
      api.get<VideoSettingsOverride>(
        `/projects/${projectId}/video-settings/${sceneTypeId}`,
      ),
    enabled: projectId > 0 && sceneTypeId > 0,
  });
}

/** Fetch all video settings overrides for a project (across scene types). */
export function useProjectVideoSettingsList(projectId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.projectList(projectId),
    queryFn: () =>
      api.get<Array<VideoSettingsOverride & { scene_type_id: number }>>(
        `/projects/${projectId}/video-settings`,
      ),
    enabled: projectId > 0,
  });
}

/** Fetch video settings overrides for a group + scene type. */
export function useGroupVideoSettings(
  projectId: number,
  groupId: number,
  sceneTypeId: number,
) {
  return useQuery({
    queryKey: videoSettingsKeys.group(groupId, sceneTypeId),
    queryFn: () =>
      api.get<VideoSettingsOverride>(
        `/projects/${projectId}/groups/${groupId}/video-settings/${sceneTypeId}`,
      ),
    enabled: projectId > 0 && groupId > 0 && sceneTypeId > 0,
  });
}

/** Fetch all video settings overrides for a avatar (across scene types). */
export function useAvatarVideoSettingsList(avatarId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.avatarList(avatarId),
    queryFn: () =>
      api.get<Array<VideoSettingsOverride & { scene_type_id: number }>>(
        `/avatars/${avatarId}/video-settings`,
      ),
    enabled: avatarId > 0,
  });
}

/** Fetch video settings overrides for a avatar + scene type. */
export function useAvatarVideoSettings(avatarId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.avatar(avatarId, sceneTypeId),
    queryFn: () =>
      api.get<VideoSettingsOverride>(
        `/avatars/${avatarId}/video-settings/${sceneTypeId}`,
      ),
    enabled: avatarId > 0 && sceneTypeId > 0,
  });
}

/** Fetch fully resolved video settings for a avatar + scene type. */
export function useResolvedVideoSettings(avatarId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.resolved(avatarId, sceneTypeId),
    queryFn: () =>
      api.get<ResolvedVideoSettings>(
        `/avatars/${avatarId}/video-settings/${sceneTypeId}/resolved`,
      ),
    enabled: avatarId > 0 && sceneTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks — Project level
   -------------------------------------------------------------------------- */

export function useUpsertProjectVideoSettings(projectId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: VideoSettingsOverride) =>
      api.put<VideoSettingsOverride>(
        `/projects/${projectId}/video-settings/${sceneTypeId}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.project(projectId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.projectList(projectId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

export function useDeleteProjectVideoSettings(projectId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/projects/${projectId}/video-settings/${sceneTypeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.project(projectId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.projectList(projectId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks — Group level
   -------------------------------------------------------------------------- */

export function useUpsertGroupVideoSettings(
  projectId: number,
  groupId: number,
  sceneTypeId: number,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: VideoSettingsOverride) =>
      api.put<VideoSettingsOverride>(
        `/projects/${projectId}/groups/${groupId}/video-settings/${sceneTypeId}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.group(groupId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.groupList(groupId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

export function useDeleteGroupVideoSettings(
  projectId: number,
  groupId: number,
  sceneTypeId: number,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(
        `/projects/${projectId}/groups/${groupId}/video-settings/${sceneTypeId}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.group(groupId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.groupList(groupId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks — Avatar level
   -------------------------------------------------------------------------- */

export function useUpsertAvatarVideoSettings(avatarId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: VideoSettingsOverride) =>
      api.put<VideoSettingsOverride>(
        `/avatars/${avatarId}/video-settings/${sceneTypeId}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.avatar(avatarId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.avatarList(avatarId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

export function useDeleteAvatarVideoSettings(avatarId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/avatars/${avatarId}/video-settings/${sceneTypeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.avatar(avatarId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.avatarList(avatarId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}
