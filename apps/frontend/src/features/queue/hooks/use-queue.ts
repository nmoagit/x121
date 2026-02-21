/**
 * TanStack Query hooks for queue management (PRD-08).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  GpuQuota,
  JobStateTransition,
  QueueStatus,
  QuotaStatus,
  SchedulingPolicy,
  SetGpuQuotaInput,
  UpsertSchedulingPolicyInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const queueKeys = {
  all: ["queue"] as const,
  status: () => [...queueKeys.all, "status"] as const,
  quotaStatus: () => [...queueKeys.all, "quota-status"] as const,
  policies: () => [...queueKeys.all, "policies"] as const,
  transitions: (jobId: number) =>
    [...queueKeys.all, "transitions", jobId] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Queue status polling interval: 10 seconds. */
const QUEUE_POLL_MS = 10_000;

/* --------------------------------------------------------------------------
   Queue status
   -------------------------------------------------------------------------- */

/** Fetches the current queue status with job list and estimated wait. */
export function useQueueStatus() {
  return useQuery({
    queryKey: queueKeys.status(),
    queryFn: () => api.get<QueueStatus>("/queue"),
    refetchInterval: QUEUE_POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Quota status
   -------------------------------------------------------------------------- */

/** Fetches the current user's GPU quota usage. */
export function useQuotaStatus() {
  return useQuery({
    queryKey: queueKeys.quotaStatus(),
    queryFn: () => api.get<QuotaStatus>("/quota/status"),
  });
}

/* --------------------------------------------------------------------------
   Job actions (pause / resume)
   -------------------------------------------------------------------------- */

/** Pause a job. */
export function usePauseJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => api.post<unknown>(`/jobs/${jobId}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.status() });
    },
  });
}

/** Resume a paused job. */
export function useResumeJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => api.post<unknown>(`/jobs/${jobId}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.status() });
    },
  });
}

/* --------------------------------------------------------------------------
   Job transitions (audit trail)
   -------------------------------------------------------------------------- */

/** Fetches the state transition history for a specific job. */
export function useJobTransitions(jobId: number) {
  return useQuery({
    queryKey: queueKeys.transitions(jobId),
    queryFn: () =>
      api.get<JobStateTransition[]>(`/jobs/${jobId}/transitions`),
    enabled: jobId > 0,
  });
}

/* --------------------------------------------------------------------------
   Admin: reorder
   -------------------------------------------------------------------------- */

/** Reorder a job's priority (admin only). */
export function useReorderJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { job_id: number; new_priority: number }) =>
      api.put<unknown>("/admin/queue/reorder", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.status() });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: user quota
   -------------------------------------------------------------------------- */

/** Set a user's GPU quota (admin only). */
export function useSetUserQuota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: number;
      input: SetGpuQuotaInput;
    }) => api.put<GpuQuota>(`/admin/users/${userId}/quota`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.quotaStatus() });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: scheduling policies
   -------------------------------------------------------------------------- */

/** List all scheduling policies (admin only). */
export function useSchedulingPolicies() {
  return useQuery({
    queryKey: queueKeys.policies(),
    queryFn: () =>
      api.get<SchedulingPolicy[]>("/admin/scheduling/policies"),
  });
}

/** Create a scheduling policy (admin only). */
export function useCreateSchedulingPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSchedulingPolicyInput) =>
      api.post<SchedulingPolicy>("/admin/scheduling/policies", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.policies() });
    },
  });
}

/** Update a scheduling policy (admin only). */
export function useUpdateSchedulingPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: UpsertSchedulingPolicyInput;
    }) =>
      api.put<SchedulingPolicy>(`/admin/scheduling/policies/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.policies() });
    },
  });
}
