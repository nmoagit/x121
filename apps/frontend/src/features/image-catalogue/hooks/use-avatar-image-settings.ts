/**
 * TanStack Query hooks for avatar-level image settings (PRD-154).
 *
 * Avatars inherit from group settings, which inherit from project settings,
 * which inherit from catalogue defaults. The effective list merges all four levels.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveImageSetting } from "../types";
import { useRemoveImageOverride, useToggleImageSetting } from "./image-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const avatarImageSettingKeys = {
  all: ["avatar-image-settings"] as const,
  lists: () => [...avatarImageSettingKeys.all, "list"] as const,
  list: (avatarId: number) => [...avatarImageSettingKeys.lists(), avatarId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective image settings for an avatar (four-level merge). */
export function useAvatarImageSettings(avatarId: number | null) {
  return useQuery({
    queryKey: avatarImageSettingKeys.list(avatarId ?? 0),
    queryFn: () => api.get<EffectiveImageSetting[]>(`/avatars/${avatarId}/image-settings`),
    enabled: avatarId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Toggle a single image setting for an avatar. */
export function useToggleAvatarImageSetting(avatarId: number) {
  return useToggleImageSetting(
    `/avatars/${avatarId}/image-settings`,
    avatarImageSettingKeys.list(avatarId),
    "avatar",
    [["avatar-dashboard", avatarId]],
  );
}

/** Remove an avatar-level override, falling back to group/project/catalogue default. */
export function useRemoveAvatarImageOverride(avatarId: number) {
  return useRemoveImageOverride(
    `/avatars/${avatarId}/image-settings`,
    avatarImageSettingKeys.list(avatarId),
    [["avatar-dashboard", avatarId]],
  );
}
