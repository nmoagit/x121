/**
 * TanStack Query hooks for the interactive job debugger (PRD-34).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  JobDebugState,
  PauseJobRequest,
  UpdateParamsRequest,
  AbortJobRequest,
  PreviewEntry,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const debugKeys = {
  all: ["job-debug"] as const,
  state: (jobId: number) => [...debugKeys.all, "state", jobId] as const,
  preview: (jobId: number) => [...debugKeys.all, "preview", jobId] as const,
};

/* --------------------------------------------------------------------------
   Get debug state (polls every 5s while active)
   -------------------------------------------------------------------------- */

/** Fetches the full debug state for a job, polling every 5 seconds. */
export function useJobDebugState(jobId: number) {
  return useQuery({
    queryKey: debugKeys.state(jobId),
    queryFn: () => api.get<JobDebugState>(`/jobs/${jobId}/debug`),
    enabled: jobId > 0,
    refetchInterval: 5000,
  });
}

/* --------------------------------------------------------------------------
   Pause job
   -------------------------------------------------------------------------- */

/** Pause a running job at the debug level. */
export function usePauseJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      input,
    }: {
      jobId: number;
      input?: PauseJobRequest;
    }) => api.post<JobDebugState>(`/jobs/${jobId}/debug/pause`, input ?? {}),
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.state(jobId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Resume job
   -------------------------------------------------------------------------- */

/** Resume a paused job. */
export function useResumeJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId }: { jobId: number }) =>
      api.post<JobDebugState>(`/jobs/${jobId}/debug/resume`, {}),
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.state(jobId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Update mid-run params
   -------------------------------------------------------------------------- */

/** Update parameters on a paused job. */
export function useUpdateParams(jobId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateParamsRequest) =>
      api.put<JobDebugState>(`/jobs/${jobId}/debug/params`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debugKeys.state(jobId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Abort job
   -------------------------------------------------------------------------- */

/** Abort a running or paused job with an optional reason. */
export function useAbortJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      input,
    }: {
      jobId: number;
      input?: AbortJobRequest;
    }) => api.post<JobDebugState>(`/jobs/${jobId}/debug/abort`, input ?? {}),
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.state(jobId) });
    },
  });
}

/* --------------------------------------------------------------------------
   Get intermediate previews (polls every 5s)
   -------------------------------------------------------------------------- */

/** Fetches intermediate preview data, polling every 5 seconds. */
export function useJobPreview(jobId: number) {
  return useQuery({
    queryKey: debugKeys.preview(jobId),
    queryFn: () => api.get<PreviewEntry[]>(`/jobs/${jobId}/debug/preview`),
    enabled: jobId > 0,
    refetchInterval: 5000,
  });
}
