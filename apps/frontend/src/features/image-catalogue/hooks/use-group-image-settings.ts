/**
 * TanStack Query hooks for group-level image settings (PRD-154).
 *
 * Groups inherit from project settings which inherit from catalogue defaults.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { EffectiveImageSetting } from "../types";
import { useRemoveImageOverride, useToggleImageSetting } from "./image-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const groupImageSettingKeys = {
  all: ["group-image-settings"] as const,
  lists: () => [...groupImageSettingKeys.all, "list"] as const,
  list: (projectId: number, groupId: number) =>
    [...groupImageSettingKeys.lists(), projectId, groupId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective image settings for a group (three-level merge). */
export function useGroupImageSettings(projectId: number, groupId: number | null) {
  return useQuery({
    queryKey: groupImageSettingKeys.list(projectId, groupId ?? 0),
    queryFn: () =>
      api.get<EffectiveImageSetting[]>(
        `/projects/${projectId}/groups/${groupId}/image-settings`,
      ),
    enabled: groupId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Toggle a single image setting for a group. */
export function useToggleGroupImageSetting(projectId: number, groupId: number) {
  return useToggleImageSetting(
    `/projects/${projectId}/groups/${groupId}/image-settings`,
    groupImageSettingKeys.list(projectId, groupId),
    "group",
  );
}

/** Remove a group-level override, falling back to project/catalogue default. */
export function useRemoveGroupImageOverride(projectId: number, groupId: number) {
  return useRemoveImageOverride(
    `/projects/${projectId}/groups/${groupId}/image-settings`,
    groupImageSettingKeys.list(projectId, groupId),
  );
}
