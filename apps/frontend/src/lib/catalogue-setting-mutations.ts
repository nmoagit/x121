/**
 * Generic factory functions for catalogue-setting toggle and remove mutations.
 *
 * Shared by scene-catalogue (PRD-111) and image-catalogue (PRD-154) to
 * avoid duplicating the identical optimistic-update pattern. The only
 * difference between the two domains is the type-ID field name
 * (`scene_type_id` vs `image_type_id`), which callers pass as `typeIdField`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { catalogueSettingUrl } from "@/lib/setting-source";

/* --------------------------------------------------------------------------
   Toggle mutation factory
   -------------------------------------------------------------------------- */

/**
 * Creates a toggle mutation for any catalogue setting level.
 *
 * Optimistically updates the cached settings list by flipping `is_enabled`
 * and updating `source` on the matched row. Reverts on error.
 *
 * @param basePath           API base path, e.g. `/avatars/5/scene-settings`
 * @param invalidationKey    Query key to invalidate on success
 * @param typeIdField        Name of the type-ID field (e.g. `"scene_type_id"` or `"image_type_id"`)
 * @param sourceName         Source label applied to toggled rows (e.g. "project", "group", "avatar")
 * @param extraInvalidationKeys  Additional query keys to invalidate on settle
 */
export function useToggleCatalogueSetting<TSetting, TUpdate>(
  basePath: string,
  invalidationKey: readonly unknown[],
  typeIdField: string,
  sourceName?: string,
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: TUpdate) => {
      const rec = update as Record<string, unknown>;
      const typeId = rec[typeIdField] as number;
      const trackId = rec.track_id as number | null | undefined;
      const isEnabled = rec.is_enabled as boolean;
      const url = catalogueSettingUrl(basePath, typeId, trackId);
      return api.put<TSetting>(url, { is_enabled: isEnabled });
    },
    onMutate: async (update: TUpdate) => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });

      const previous = queryClient.getQueryData<TSetting[]>(invalidationKey);

      const updateRec = update as Record<string, unknown>;
      queryClient.setQueryData<TSetting[]>(invalidationKey, (old) => {
        if (!old) return old;
        return old.map((row) => {
          const rowRec = row as Record<string, unknown>;
          if (
            rowRec[typeIdField] === updateRec[typeIdField] &&
            rowRec.track_id === (updateRec.track_id ?? null)
          ) {
            return {
              ...row,
              is_enabled: updateRec.is_enabled,
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

/* --------------------------------------------------------------------------
   Remove-override mutation factory
   -------------------------------------------------------------------------- */

/**
 * Creates a remove-override mutation for any catalogue setting level.
 *
 * Optimistically snapshots the cache, deletes the override on the server,
 * and reverts on error. The actual fallback value comes from the server refetch.
 *
 * @param basePath           API base path, e.g. `/avatars/5/scene-settings`
 * @param invalidationKey    Query key to invalidate on success
 * @param extraInvalidationKeys  Additional query keys to invalidate on settle
 */
export function useRemoveCatalogueOverride<TSetting>(
  basePath: string,
  invalidationKey: readonly unknown[],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { typeId: number; trackId: number | null }) => {
      const url = catalogueSettingUrl(basePath, params.typeId, params.trackId);
      return api.delete(url);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: invalidationKey });
      const previous = queryClient.getQueryData<TSetting[]>(invalidationKey);
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
