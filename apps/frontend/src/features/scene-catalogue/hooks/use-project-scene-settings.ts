/**
 * TanStack Query hooks for project-level scene settings (PRD-111).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { projectKeys } from "@/features/projects/hooks/use-projects";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";
import { useToggleSceneSetting } from "./scene-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const projectSceneSettingKeys = {
  all: ["project-scene-settings"] as const,
  lists: () => [...projectSceneSettingKeys.all, "list"] as const,
  list: (projectId: number) => [...projectSceneSettingKeys.lists(), projectId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective scene settings for a project. */
export function useProjectSceneSettings(projectId: number | null) {
  return useQuery({
    queryKey: projectSceneSettingKeys.list(projectId ?? 0),
    queryFn: () => api.get<EffectiveSceneSetting[]>(`/projects/${projectId}/scene-settings`),
    enabled: projectId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Bulk update project scene settings. */
export function useBulkUpdateProjectSceneSettings(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: SceneSettingUpdate[]) =>
      api.put<EffectiveSceneSetting[]>(`/projects/${projectId}/scene-settings`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectSceneSettingKeys.list(projectId),
      });
      // Scene settings affect deliverable counts, stats, and readiness
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.stats(projectId) });
      queryClient.invalidateQueries({ queryKey: ["character-dashboard"] });
    },
  });
}

/** Toggle a single scene setting for a project. */
export function useToggleProjectSceneSetting(projectId: number) {
  return useToggleSceneSetting(
    `/projects/${projectId}/scene-settings`,
    projectSceneSettingKeys.list(projectId),
    "project",
    [
      projectKeys.detail(projectId),
      projectKeys.stats(projectId),
      ["character-dashboard"] as const,
    ],
  );
}
