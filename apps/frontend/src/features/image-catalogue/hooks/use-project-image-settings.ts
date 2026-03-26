/**
 * TanStack Query hooks for project-level image settings (PRD-154).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { projectKeys } from "@/features/projects/hooks/use-projects";
import type { EffectiveImageSetting } from "../types";
import { useToggleImageSetting } from "./image-setting-mutations";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const projectImageSettingKeys = {
  all: ["project-image-settings"] as const,
  lists: () => [...projectImageSettingKeys.all, "list"] as const,
  list: (projectId: number) => [...projectImageSettingKeys.lists(), projectId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch effective image settings for a project. */
export function useProjectImageSettings(projectId: number | null) {
  return useQuery({
    queryKey: projectImageSettingKeys.list(projectId ?? 0),
    queryFn: () => api.get<EffectiveImageSetting[]>(`/projects/${projectId}/image-settings`),
    enabled: projectId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Toggle a single image setting for a project. */
export function useToggleProjectImageSetting(projectId: number) {
  return useToggleImageSetting(
    `/projects/${projectId}/image-settings`,
    projectImageSettingKeys.list(projectId),
    "project",
    [
      projectKeys.detail(projectId),
      projectKeys.stats(projectId),
      ["avatar-dashboard"] as const,
    ],
  );
}
