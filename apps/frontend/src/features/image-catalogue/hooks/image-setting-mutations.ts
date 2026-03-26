/**
 * Factory functions for image-setting toggle and remove mutations (PRD-154).
 *
 * Shared by project, group, and avatar image setting hooks to avoid
 * duplicating the same mutation pattern across all three levels.
 *
 * Both mutations use optimistic updates — the UI flips immediately and
 * only reverts if the server request fails.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveImageSetting, ImageSettingUpdate } from "../types";
import { imageSettingUrl } from "../types";

/**
 * Creates a toggle mutation for any image setting level.
 *
 * Optimistically updates the cached settings list by flipping `is_enabled`
 * and updating `source` on the matched row. Reverts on error.
 *
 * @param basePath  API base path, e.g. `/avatars/5/image-settings`
 * @param invalidationKey  Query key to invalidate on success
 * @param sourceName  Source label applied to toggled rows (e.g. "project", "group", "avatar")
 * @param extraInvalidationKeys  Additional query keys to invalidate on settle
 */
export function useToggleImageSetting(
  basePath: string,
  invalidationKey: readonly unknown[],
  sourceName?: EffectiveImageSetting["source"],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ImageSettingUpdate) => {
      const url = imageSettingUrl(basePath, update.image_type_id, update.track_id);
      return api.put<EffectiveImageSetting>(url, { is_enabled: update.is_enabled });
    },
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });

      const previous = queryClient.getQueryData<EffectiveImageSetting[]>(invalidationKey);

      queryClient.setQueryData<EffectiveImageSetting[]>(invalidationKey, (old) => {
        if (!old) return old;
        return old.map((row) => {
          if (
            row.image_type_id === update.image_type_id &&
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
 * Creates a remove-override mutation for any image setting level.
 *
 * Reverts on error, then refetches from server for the actual fallback value.
 *
 * @param basePath  API base path, e.g. `/avatars/5/image-settings`
 * @param invalidationKey  Query key to invalidate on success
 * @param extraInvalidationKeys  Additional query keys to invalidate on settle
 */
export function useRemoveImageOverride(
  basePath: string,
  invalidationKey: readonly unknown[],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { imageTypeId: number; trackId: number | null }) => {
      const url = imageSettingUrl(basePath, params.imageTypeId, params.trackId);
      return api.delete(url);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });
      const previous = queryClient.getQueryData<EffectiveImageSetting[]>(invalidationKey);
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
