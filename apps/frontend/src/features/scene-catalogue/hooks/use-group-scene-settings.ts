/**
 * TanStack Query hooks for group-level scene settings.
 *
 * Groups inherit from project settings which inherit from catalogue defaults.
 * The effective list merges all three levels (scene_type → project → group).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveSceneSetting } from "../types";
import { useRemoveSceneOverride, useToggleSceneSetting } from "./scene-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const groupSceneSettingKeys = {
  all: ["group-scene-settings"] as const,
  lists: () => [...groupSceneSettingKeys.all, "list"] as const,
  list: (projectId: number, groupId: number) =>
    [...groupSceneSettingKeys.lists(), projectId, groupId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective scene settings for a group (three-level merge). */
export function useGroupSceneSettings(projectId: number, groupId: number | null) {
  return useQuery({
    queryKey: groupSceneSettingKeys.list(projectId, groupId ?? 0),
    queryFn: () =>
      api.get<EffectiveSceneSetting[]>(
        `/projects/${projectId}/groups/${groupId}/scene-settings`,
      ),
    enabled: groupId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Toggle a single scene setting for a group. */
export function useToggleGroupSceneSetting(projectId: number, groupId: number) {
  return useToggleSceneSetting(
    `/projects/${projectId}/groups/${groupId}/scene-settings`,
    groupSceneSettingKeys.list(projectId, groupId),
    "group",
  );
}

/** Remove a group-level override, falling back to project/catalogue default. */
export function useRemoveGroupSceneOverride(projectId: number, groupId: number) {
  return useRemoveSceneOverride(
    `/projects/${projectId}/groups/${groupId}/scene-settings`,
    groupSceneSettingKeys.list(projectId, groupId),
  );
}
