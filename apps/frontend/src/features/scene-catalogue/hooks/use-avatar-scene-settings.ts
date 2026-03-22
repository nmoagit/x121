/**
 * TanStack Query hooks for avatar-level scene settings (PRD-111).
 *
 * Avatars inherit from group settings, which inherit from project settings,
 * which inherit from catalogue defaults. The effective list merges all four levels.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";
import { useRemoveSceneOverride, useToggleSceneSetting } from "./scene-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const avatarSceneSettingKeys = {
  all: ["avatar-scene-settings"] as const,
  lists: () => [...avatarSceneSettingKeys.all, "list"] as const,
  list: (avatarId: number) => [...avatarSceneSettingKeys.lists(), avatarId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective scene settings for a avatar (four-level merge). */
export function useAvatarSceneSettings(avatarId: number | null) {
  return useQuery({
    queryKey: avatarSceneSettingKeys.list(avatarId ?? 0),
    queryFn: () => api.get<EffectiveSceneSetting[]>(`/avatars/${avatarId}/scene-settings`),
    enabled: avatarId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Bulk update avatar scene setting overrides. */
export function useBulkUpdateAvatarSceneSettings(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: SceneSettingUpdate[]) =>
      api.put<EffectiveSceneSetting[]>(`/avatars/${avatarId}/scene-settings`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarSceneSettingKeys.list(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: ["avatar-dashboard", avatarId],
      });
    },
  });
}

/** Toggle a single scene setting for a avatar. */
export function useToggleAvatarSceneSetting(avatarId: number) {
  return useToggleSceneSetting(
    `/avatars/${avatarId}/scene-settings`,
    avatarSceneSettingKeys.list(avatarId),
    "avatar",
    [["avatar-dashboard", avatarId]],
  );
}

/** Remove a avatar-level override, falling back to group/project/catalogue default. */
export function useRemoveAvatarSceneOverride(avatarId: number) {
  return useRemoveSceneOverride(
    `/avatars/${avatarId}/scene-settings`,
    avatarSceneSettingKeys.list(avatarId),
    [["avatar-dashboard", avatarId]],
  );
}
