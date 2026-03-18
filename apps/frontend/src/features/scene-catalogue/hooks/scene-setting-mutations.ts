/**
 * Factory functions for scene-setting toggle and remove mutations.
 *
 * Shared by project, group, and character scene setting hooks to avoid
 * duplicating the same mutation pattern across all three levels.
 *
 * Both mutations use optimistic updates — the UI flips immediately and
 * only reverts if the server request fails.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";
import { sceneSettingUrl } from "../types";

/**
 * Creates a toggle mutation for any scene setting level.
 *
 * Optimistically updates the cached settings list by flipping `is_enabled`
 * and updating `source` on the matched row. Reverts on error.
 *
 * @param basePath  API base path, e.g. `/characters/5/scene-settings`
 * @param invalidationKey  Query key to invalidate on success
 * @param sourceName  Source label applied to toggled rows (e.g. "project", "group", "character")
 */
export function useToggleSceneSetting(
  basePath: string,
  invalidationKey: readonly unknown[],
  sourceName?: EffectiveSceneSetting["source"],
  /** Additional query keys to invalidate on settle (e.g. project detail for deliverables cascade). */
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: SceneSettingUpdate) => {
      const url = sceneSettingUrl(basePath, update.scene_type_id, update.track_id);
      return api.put<EffectiveSceneSetting>(url, { is_enabled: update.is_enabled });
    },
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });

      const previous = queryClient.getQueryData<EffectiveSceneSetting[]>(invalidationKey);

      queryClient.setQueryData<EffectiveSceneSetting[]>(invalidationKey, (old) => {
        if (!old) return old;
        return old.map((row) => {
          if (
            row.scene_type_id === update.scene_type_id &&
            row.track_id === (update.track_id ?? null)
          ) {
            return {
              ...row,
              is_enabled: update.is_enabled,
              ...(sourceName ? { source: sourceName } : {}),
            };
          }
          return row;
        });
      });

      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(invalidationKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invalidationKey });
      for (const key of extraInvalidationKeys ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * Creates a remove-override mutation for any scene setting level.
 *
 * Optimistically removes the override by reverting `source` to a lower level
 * and keeping `is_enabled` unchanged (actual fallback value comes from the
 * server refetch). Reverts on error.
 *
 * @param basePath  API base path, e.g. `/characters/5/scene-settings`
 * @param invalidationKey  Query key to invalidate on success
 */
export function useRemoveSceneOverride(
  basePath: string,
  invalidationKey: readonly unknown[],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { sceneTypeId: number; trackId: number | null }) => {
      const url = sceneSettingUrl(basePath, params.sceneTypeId, params.trackId);
      return api.delete(url);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });
      const previous = queryClient.getQueryData<EffectiveSceneSetting[]>(invalidationKey);
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(invalidationKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invalidationKey });
      for (const key of extraInvalidationKeys ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
