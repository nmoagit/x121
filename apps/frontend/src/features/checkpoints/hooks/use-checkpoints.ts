/**
 * TanStack Query hooks for pipeline checkpoints & diagnostics (PRD-28).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  Checkpoint,
  FailureDiagnostics,
  ResumeFromCheckpointInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const checkpointKeys = {
  all: ["checkpoints"] as const,
  listByJob: (jobId: number) =>
    [...checkpointKeys.all, "job", jobId] as const,
  detail: (jobId: number, checkpointId: number) =>
    [...checkpointKeys.all, "job", jobId, "detail", checkpointId] as const,
  diagnostics: (jobId: number) =>
    [...checkpointKeys.all, "diagnostics", jobId] as const,
};

/* --------------------------------------------------------------------------
   List checkpoints for a job
   -------------------------------------------------------------------------- */

/** Fetches all checkpoints for a job, ordered by stage index. */
export function useCheckpoints(jobId: number) {
  return useQuery({
    queryKey: checkpointKeys.listByJob(jobId),
    queryFn: () =>
      api.get<Checkpoint[]>(`/jobs/${jobId}/checkpoints`),
    enabled: jobId > 0,
  });
}

/* --------------------------------------------------------------------------
   Get single checkpoint
   -------------------------------------------------------------------------- */

/** Fetches a single checkpoint by ID. */
export function useCheckpoint(jobId: number, checkpointId: number) {
  return useQuery({
    queryKey: checkpointKeys.detail(jobId, checkpointId),
    queryFn: () =>
      api.get<Checkpoint>(`/jobs/${jobId}/checkpoints/${checkpointId}`),
    enabled: jobId > 0 && checkpointId > 0,
  });
}

/* --------------------------------------------------------------------------
   Failure diagnostics
   -------------------------------------------------------------------------- */

/** Fetches structured failure diagnostics for a job. */
export function useFailureDiagnostics(jobId: number) {
  return useQuery({
    queryKey: checkpointKeys.diagnostics(jobId),
    queryFn: () =>
      api.get<FailureDiagnostics>(`/jobs/${jobId}/diagnostics`),
    enabled: jobId > 0,
  });
}

/* --------------------------------------------------------------------------
   Resume from checkpoint
   -------------------------------------------------------------------------- */

/** Resume a failed job from its last checkpoint, with optional param mods. */
export function useResumeFromCheckpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      input,
    }: {
      jobId: number;
      input: ResumeFromCheckpointInput;
    }) => api.post<unknown>(`/jobs/${jobId}/resume-from-checkpoint`, input),
    onSuccess: (_data, { jobId }) => {
      queryClient.invalidateQueries({
        queryKey: checkpointKeys.listByJob(jobId),
      });
      queryClient.invalidateQueries({
        queryKey: checkpointKeys.diagnostics(jobId),
      });
    },
  });
}
