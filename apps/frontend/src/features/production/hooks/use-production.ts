/**
 * Production run TanStack Query hooks (PRD-57).
 *
 * Provides hooks for creating, listing, and managing production runs,
 * matrix cells, submission, resubmission, delivery, and progress tracking.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateProductionRunRequest,
  EnabledSceneTypeEntry,
  ProductionRun,
  ProductionRunCell,
  ProductionRunProgress,
  SubmitCellsRequest,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const productionKeys = {
  all: ["production-runs"] as const,
  list: (projectId: number) =>
    ["production-runs", "list", { projectId }] as const,
  detail: (id: number) => ["production-runs", "detail", id] as const,
  matrix: (id: number) => ["production-runs", "matrix", id] as const,
  progress: (id: number) => ["production-runs", "progress", id] as const,
  enabledSceneTypes: (projectId: number, avatarIds: number[]) =>
    ["production-runs", "enabled-scene-types", { projectId, avatarIds }] as const,
};

/* --------------------------------------------------------------------------
   Production Run Queries
   -------------------------------------------------------------------------- */

/** List production runs for a project. */
export function useProductionRuns(projectId: number) {
  return useQuery({
    queryKey: productionKeys.list(projectId),
    queryFn: () =>
      api.get<ProductionRun[]>(
        `/production-runs?project_id=${projectId}`,
      ),
    enabled: projectId > 0,
  });
}

/** Fetch a single production run by ID. */
export function useProductionRun(id: number) {
  return useQuery({
    queryKey: productionKeys.detail(id),
    queryFn: () => api.get<ProductionRun>(`/production-runs/${id}`),
    enabled: id > 0,
  });
}

/** Fetch the matrix cells for a production run. */
export function useProductionMatrix(runId: number) {
  return useQuery({
    queryKey: productionKeys.matrix(runId),
    queryFn: () =>
      api.get<ProductionRunCell[]>(`/production-runs/${runId}/matrix`),
    enabled: runId > 0,
  });
}

/** Fetch aggregate progress for a production run. */
export function useProductionProgress(runId: number) {
  return useQuery({
    queryKey: productionKeys.progress(runId),
    queryFn: () =>
      api.get<ProductionRunProgress>(`/production-runs/${runId}/progress`),
    enabled: runId > 0,
    refetchInterval: 10_000, // Poll every 10s for live progress
  });
}

/** Fetch enabled scene types for a set of avatars in a project. */
export function useEnabledSceneTypes(projectId: number, avatarIds: number[]) {
  return useQuery({
    queryKey: productionKeys.enabledSceneTypes(projectId, avatarIds),
    queryFn: () =>
      api.get<EnabledSceneTypeEntry[]>(
        `/production-runs/enabled-scene-types?project_id=${projectId}&avatar_ids=${avatarIds.join(",")}`,
      ),
    enabled: projectId > 0 && avatarIds.length > 0,
  });
}

/* --------------------------------------------------------------------------
   Production Run Mutations
   -------------------------------------------------------------------------- */

/** Create a new production run. */
export function useCreateProductionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductionRunRequest) =>
      api.post<ProductionRun>("/production-runs", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.list(variables.project_id),
      });
    },
  });
}

/** Submit cells in a production run for generation. */
export function useSubmitCells(runId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitCellsRequest) =>
      api.post(`/production-runs/${runId}/submit`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.detail(runId),
      });
      queryClient.invalidateQueries({
        queryKey: productionKeys.matrix(runId),
      });
      queryClient.invalidateQueries({
        queryKey: productionKeys.progress(runId),
      });
    },
  });
}

/** Resubmit failed cells in a production run. */
export function useResubmitFailed(runId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post(`/production-runs/${runId}/resubmit-failed`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.matrix(runId),
      });
      queryClient.invalidateQueries({
        queryKey: productionKeys.progress(runId),
      });
    },
  });
}

/** Trigger delivery for a production run. */
export function useDeliverRun(runId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post(`/production-runs/${runId}/deliver`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.detail(runId),
      });
      queryClient.invalidateQueries({
        queryKey: productionKeys.progress(runId),
      });
    },
  });
}

/** Cancel specific cells in a production run. */
export function useCancelCells(runId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cellIds: number[]) =>
      api.post(`/production-runs/${runId}/cells/cancel`, { cell_ids: cellIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionKeys.matrix(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.progress(runId) });
    },
  });
}

/** Delete specific cells from a production run. */
export function useDeleteCells(runId: number, projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cellIds: number[]) =>
      api.post(`/production-runs/${runId}/cells/delete`, { cell_ids: cellIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionKeys.matrix(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.progress(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.list(projectId) });
    },
  });
}

/** Cancel all cells for a avatar in a production run. */
export function useCancelAvatarCells(runId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (avatarId: number) =>
      api.post(`/production-runs/${runId}/avatars/${avatarId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionKeys.matrix(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.progress(runId) });
    },
  });
}

/** Delete all cells for a avatar in a production run. */
export function useDeleteAvatarCells(runId: number, projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (avatarId: number) =>
      api.post(`/production-runs/${runId}/avatars/${avatarId}/delete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productionKeys.matrix(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.progress(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.detail(runId) });
      queryClient.invalidateQueries({ queryKey: productionKeys.list(projectId) });
    },
  });
}

/** Cancel a production run. */
export function useCancelProductionRun(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/production-runs/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.list(projectId),
      });
    },
  });
}

/** Delete a production run. */
export function useDeleteProductionRun(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/production-runs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.list(projectId),
      });
    },
  });
}
