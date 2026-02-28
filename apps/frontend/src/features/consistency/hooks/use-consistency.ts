/**
 * TanStack Query hooks for Character Consistency Report (PRD-94).
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
  character: (characterId: number) =>
    [...consistencyKeys.all, "character", characterId] as const,
  project: (projectId: number) =>
    [...consistencyKeys.all, "project", projectId] as const,
};

/* --------------------------------------------------------------------------
   Character queries
   -------------------------------------------------------------------------- */

/** Fetches the latest consistency report for a character. */
export function useConsistencyReport(characterId: number) {
  return useQuery({
    queryKey: consistencyKeys.character(characterId),
    queryFn: () =>
      api.get<ConsistencyReport>(`/characters/${characterId}/consistency`),
    enabled: characterId > 0,
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

/** Generates a new consistency report for a character. */
export function useGenerateConsistencyReport(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateConsistencyInput) =>
      api.post<ConsistencyReport>(
        `/characters/${characterId}/consistency`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: consistencyKeys.character(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: consistencyKeys.all,
      });
    },
  });
}

/** Generates consistency reports for multiple characters. */
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
