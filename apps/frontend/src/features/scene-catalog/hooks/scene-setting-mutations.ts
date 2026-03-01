/**
 * Factory functions for scene-setting toggle and remove mutations.
 *
 * Shared by project, group, and character scene setting hooks to avoid
 * duplicating the same mutation pattern across all three levels.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";
import { sceneSettingUrl } from "../types";

/**
 * Creates a toggle mutation for any scene setting level.
 *
 * @param basePath  API base path, e.g. `/characters/5/scene-settings`
 * @param invalidationKey  Query key to invalidate on success
 */
export function useToggleSceneSetting(basePath: string, invalidationKey: readonly unknown[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: SceneSettingUpdate) => {
      const url = sceneSettingUrl(basePath, update.scene_type_id, update.track_id);
      return api.put<EffectiveSceneSetting>(url, { is_enabled: update.is_enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidationKey });
    },
  });
}

/**
 * Creates a remove-override mutation for any scene setting level.
 *
 * @param basePath  API base path, e.g. `/characters/5/scene-settings`
 * @param invalidationKey  Query key to invalidate on success
 */
export function useRemoveSceneOverride(basePath: string, invalidationKey: readonly unknown[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { sceneTypeId: number; trackId: number | null }) => {
      const url = sceneSettingUrl(basePath, params.sceneTypeId, params.trackId);
      return api.delete(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidationKey });
    },
  });
}
