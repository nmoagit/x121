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
  character: (characterId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "character", characterId, sceneTypeId] as const,
  characterList: (characterId: number) =>
    [...videoSettingsKeys.all, "character-list", characterId] as const,
  resolved: (characterId: number, sceneTypeId: number) =>
    [...videoSettingsKeys.all, "resolved", characterId, sceneTypeId] as const,
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

/** Fetch all video settings overrides for a character (across scene types). */
export function useCharacterVideoSettingsList(characterId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.characterList(characterId),
    queryFn: () =>
      api.get<Array<VideoSettingsOverride & { scene_type_id: number }>>(
        `/characters/${characterId}/video-settings`,
      ),
    enabled: characterId > 0,
  });
}

/** Fetch video settings overrides for a character + scene type. */
export function useCharacterVideoSettings(characterId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.character(characterId, sceneTypeId),
    queryFn: () =>
      api.get<VideoSettingsOverride>(
        `/characters/${characterId}/video-settings/${sceneTypeId}`,
      ),
    enabled: characterId > 0 && sceneTypeId > 0,
  });
}

/** Fetch fully resolved video settings for a character + scene type. */
export function useResolvedVideoSettings(characterId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: videoSettingsKeys.resolved(characterId, sceneTypeId),
    queryFn: () =>
      api.get<ResolvedVideoSettings>(
        `/characters/${characterId}/video-settings/${sceneTypeId}/resolved`,
      ),
    enabled: characterId > 0 && sceneTypeId > 0,
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
   Mutation hooks — Character level
   -------------------------------------------------------------------------- */

export function useUpsertCharacterVideoSettings(characterId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: VideoSettingsOverride) =>
      api.put<VideoSettingsOverride>(
        `/characters/${characterId}/video-settings/${sceneTypeId}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.character(characterId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.characterList(characterId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}

export function useDeleteCharacterVideoSettings(characterId: number, sceneTypeId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/characters/${characterId}/video-settings/${sceneTypeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: videoSettingsKeys.character(characterId, sceneTypeId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.characterList(characterId) });
      qc.invalidateQueries({ queryKey: videoSettingsKeys.all });
    },
  });
}
