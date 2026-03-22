/**
 * TanStack Query hooks for project speech configuration (PRD-136).
 *
 * Manages the per-project speech type + language matrix with minimum variant counts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ProjectSpeechConfigEntry } from "@/features/avatars/types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const speechConfigKeys = {
  detail: (projectId: number) => ["projects", projectId, "speech-config"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

export function useProjectSpeechConfig(projectId: number) {
  return useQuery({
    queryKey: speechConfigKeys.detail(projectId),
    queryFn: () => api.get<ProjectSpeechConfigEntry[]>(`/projects/${projectId}/speech-config`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

export function useSetProjectSpeechConfig(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: ProjectSpeechConfigEntry[]) =>
      api.put<ProjectSpeechConfigEntry[]>(`/projects/${projectId}/speech-config`, { entries }),
    onSuccess: () => qc.invalidateQueries({ queryKey: speechConfigKeys.detail(projectId) }),
  });
}
