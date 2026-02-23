/**
 * TanStack Query hooks for Character Duplicate Detection (PRD-79).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BatchCheckRequest,
  CheckDuplicateRequest,
  DuplicateCheck,
  DuplicateDetectionSetting,
  ResolveCheckRequest,
  UpdateDuplicateSetting,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const duplicateKeys = {
  all: ["duplicates"] as const,
  history: (limit?: number, offset?: number) =>
    [...duplicateKeys.all, "history", limit, offset] as const,
  settings: (projectId?: number) =>
    [...duplicateKeys.all, "settings", projectId] as const,
};

/* --------------------------------------------------------------------------
   Checking mutations
   -------------------------------------------------------------------------- */

/** Check a single character for duplicates. */
export function useCheckDuplicate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CheckDuplicateRequest) =>
      api.post<DuplicateCheck>("/characters/duplicates/check", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: duplicateKeys.all });
    },
  });
}

/** Batch-check multiple characters for cross-duplicates. */
export function useBatchCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchCheckRequest) =>
      api.post<DuplicateCheck[]>("/characters/duplicates/batch", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: duplicateKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   History query
   -------------------------------------------------------------------------- */

/** Fetch duplicate check history with pagination. */
export function useDuplicateHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: duplicateKeys.history(limit, offset),
    queryFn: () =>
      api.get<DuplicateCheck[]>(
        `/characters/duplicates/history?limit=${limit}&offset=${offset}`,
      ),
  });
}

/* --------------------------------------------------------------------------
   Resolution mutations
   -------------------------------------------------------------------------- */

/** Resolve a duplicate check with a chosen resolution. */
export function useResolveCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: ResolveCheckRequest & { id: number }) =>
      api.post<DuplicateCheck>(
        `/characters/duplicates/${id}/resolve`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: duplicateKeys.all });
    },
  });
}

/** Dismiss a duplicate check (shortcut). */
export function useDismissCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<DuplicateCheck>(`/characters/duplicates/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: duplicateKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Settings queries / mutations
   -------------------------------------------------------------------------- */

/** Fetch duplicate detection settings (project-level or studio default). */
export function useDuplicateSettings(projectId?: number) {
  const params = projectId ? `?project_id=${projectId}` : "";
  return useQuery({
    queryKey: duplicateKeys.settings(projectId),
    queryFn: () =>
      api.get<DuplicateDetectionSetting>(
        `/admin/duplicate-settings${params}`,
      ),
  });
}

/** Update duplicate detection settings. */
export function useUpdateDuplicateSettings(projectId?: number) {
  const queryClient = useQueryClient();
  const params = projectId ? `?project_id=${projectId}` : "";

  return useMutation({
    mutationFn: (input: UpdateDuplicateSetting) =>
      api.put<DuplicateDetectionSetting>(
        `/admin/duplicate-settings${params}`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: duplicateKeys.settings(projectId),
      });
    },
  });
}
