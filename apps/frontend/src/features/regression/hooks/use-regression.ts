/**
 * TanStack Query hooks for Workflow Regression Testing (PRD-65).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateRegressionReference,
  RegressionReference,
  RegressionRun,
  RunReport,
  TriggerRegressionRun,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const regressionKeys = {
  all: ["regression"] as const,
  references: () => [...regressionKeys.all, "references"] as const,
  reference: (id: number) => [...regressionKeys.references(), id] as const,
  runs: () => [...regressionKeys.all, "runs"] as const,
  run: (id: number) => [...regressionKeys.runs(), id] as const,
  report: (runId: number) => [...regressionKeys.run(runId), "report"] as const,
};

/* --------------------------------------------------------------------------
   Reference queries
   -------------------------------------------------------------------------- */

/** Fetches all regression reference scenes. */
export function useRegressionReferences() {
  return useQuery({
    queryKey: regressionKeys.references(),
    queryFn: () => api.get<RegressionReference[]>("/regression/references"),
  });
}

/* --------------------------------------------------------------------------
   Run queries
   -------------------------------------------------------------------------- */

/** Fetches all regression runs. */
export function useRegressionRuns() {
  return useQuery({
    queryKey: regressionKeys.runs(),
    queryFn: () => api.get<RegressionRun[]>("/regression/runs"),
  });
}

/** Fetches the detailed report for a specific run. */
export function useRunReport(runId: number) {
  return useQuery({
    queryKey: regressionKeys.report(runId),
    queryFn: () => api.get<RunReport>(`/regression/runs/${runId}/report`),
    enabled: runId > 0,
  });
}

/* --------------------------------------------------------------------------
   Reference mutations
   -------------------------------------------------------------------------- */

/** Creates a new regression reference. */
export function useCreateReference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRegressionReference) =>
      api.post<RegressionReference>("/regression/references", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: regressionKeys.references(),
      });
    },
  });
}

/** Deletes a regression reference by ID. */
export function useDeleteReference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (referenceId: number) =>
      api.delete(`/regression/references/${referenceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: regressionKeys.references(),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Run mutations
   -------------------------------------------------------------------------- */

/** Triggers a new regression run. */
export function useTriggerRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TriggerRegressionRun) =>
      api.post<RegressionRun>("/regression/runs", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: regressionKeys.runs(),
      });
    },
  });
}
