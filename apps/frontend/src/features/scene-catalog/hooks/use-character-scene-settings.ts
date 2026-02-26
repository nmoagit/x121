/**
 * TanStack Query hooks for character-level scene settings (PRD-111).
 *
 * Characters inherit from project settings which inherit from catalog defaults.
 * The effective list merges all three levels.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const characterSceneSettingKeys = {
  all: ["character-scene-settings"] as const,
  lists: () => [...characterSceneSettingKeys.all, "list"] as const,
  list: (characterId: number) =>
    [...characterSceneSettingKeys.lists(), characterId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective scene settings for a character (three-level merge). */
export function useCharacterSceneSettings(characterId: number | null) {
  return useQuery({
    queryKey: characterSceneSettingKeys.list(characterId ?? 0),
    queryFn: () =>
      api.get<EffectiveSceneSetting[]>(
        `/characters/${characterId}/scene-settings`,
      ),
    enabled: characterId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Bulk update character scene setting overrides. */
export function useBulkUpdateCharacterSceneSettings(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: SceneSettingUpdate[]) =>
      api.put<EffectiveSceneSetting[]>(
        `/characters/${characterId}/scene-settings`,
        updates,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterSceneSettingKeys.list(characterId),
      });
    },
  });
}

/** Toggle a single scene setting for a character. */
export function useToggleCharacterSceneSetting(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: SceneSettingUpdate) =>
      api.put<EffectiveSceneSetting>(
        `/characters/${characterId}/scene-settings/${update.scene_catalog_id}`,
        { is_enabled: update.is_enabled },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterSceneSettingKeys.list(characterId),
      });
    },
  });
}

/** Remove a character-level override, falling back to project/catalog default. */
export function useRemoveCharacterSceneOverride(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sceneCatalogId: number) =>
      api.delete(
        `/characters/${characterId}/scene-settings/${sceneCatalogId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterSceneSettingKeys.list(characterId),
      });
    },
  });
}
