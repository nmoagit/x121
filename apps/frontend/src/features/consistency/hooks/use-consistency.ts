/**
 * TanStack Query hooks for Avatar Consistency Report (PRD-94).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BatchConsistencyInput,
  ConsistencyReport,
  GenerateConsistencyInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const consistencyKeys = {
  all: ["consistency"] as const,
  avatar: (avatarId: number) =>
    [...consistencyKeys.all, "avatar", avatarId] as const,
  project: (projectId: number) =>
    [...consistencyKeys.all, "project", projectId] as const,
};

/* --------------------------------------------------------------------------
   Avatar queries
   -------------------------------------------------------------------------- */

/** Fetches the latest consistency report for a avatar. */
export function useConsistencyReport(avatarId: number) {
  return useQuery({
    queryKey: consistencyKeys.avatar(avatarId),
    queryFn: () =>
      api.get<ConsistencyReport>(`/avatars/${avatarId}/consistency`),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Project queries
   -------------------------------------------------------------------------- */

/** Fetches all consistency reports for a project. */
export function useProjectConsistency(projectId: number) {
  return useQuery({
    queryKey: consistencyKeys.project(projectId),
    queryFn: () =>
      api.get<ConsistencyReport[]>(`/projects/${projectId}/consistency`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Generates a new consistency report for a avatar. */
export function useGenerateConsistencyReport(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateConsistencyInput) =>
      api.post<ConsistencyReport>(
        `/avatars/${avatarId}/consistency`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: consistencyKeys.avatar(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: consistencyKeys.all,
      });
    },
  });
}

/** Generates consistency reports for multiple avatars. */
export function useBatchConsistencyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchConsistencyInput) =>
      api.post<ConsistencyReport[]>("/consistency/batch", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: consistencyKeys.all,
      });
    },
  });
}
