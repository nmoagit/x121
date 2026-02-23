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
