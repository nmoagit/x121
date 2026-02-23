/**
 * Character Readiness TanStack Query hooks (PRD-107).
 *
 * Provides hooks for reading readiness state, managing criteria,
 * and batch evaluation.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  batchEvaluateReadiness,
  createCriteria,
  deleteCriteria,
  fetchCharacterReadiness,
  fetchCriteria,
  fetchReadinessSummary,
  invalidateCharacterReadiness,
  updateCriteria,
} from "../api";
import type {
  BatchEvaluateRequest,
  CreateReadinessCriteria,
  UpdateReadinessCriteria,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const readinessKeys = {
  all: ["readiness"] as const,
  character: (characterId: number) =>
    ["readiness", "character", characterId] as const,
  summary: (projectId?: number) =>
    ["readiness", "summary", projectId] as const,
  criteria: ["readiness", "criteria"] as const,
  batch: (ids: number[]) => ["readiness", "batch", ...ids] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch readiness for a single character. */
export function useCharacterReadiness(characterId: number) {
  return useQuery({
    queryKey: readinessKeys.character(characterId),
    queryFn: () => fetchCharacterReadiness(characterId),
    enabled: characterId > 0,
  });
}

/** Fetch readiness summary for a project or the whole library. */
export function useReadinessSummary(projectId?: number) {
  return useQuery({
    queryKey: readinessKeys.summary(projectId),
    queryFn: () => fetchReadinessSummary(projectId),
  });
}

/** Fetch all readiness criteria. */
export function useCriteria() {
  return useQuery({
    queryKey: readinessKeys.criteria,
    queryFn: fetchCriteria,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Invalidate readiness cache for a character. */
export function useInvalidateReadiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (characterId: number) =>
      invalidateCharacterReadiness(characterId),
    onSuccess: (_data, characterId) => {
      queryClient.invalidateQueries({
        queryKey: readinessKeys.character(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: readinessKeys.all,
      });
    },
  });
}

/** Batch evaluate readiness for multiple characters. */
export function useBatchEvaluate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BatchEvaluateRequest) =>
      batchEvaluateReadiness(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessKeys.all });
    },
  });
}

/** Create a new readiness criteria. */
export function useCreateCriteria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReadinessCriteria) => createCriteria(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessKeys.criteria });
    },
  });
}

/** Update an existing readiness criteria. */
export function useUpdateCriteria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateReadinessCriteria }) =>
      updateCriteria(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessKeys.criteria });
    },
  });
}

/** Delete a readiness criteria. */
export function useDeleteCriteria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteCriteria(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: readinessKeys.criteria });
    },
  });
}
