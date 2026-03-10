/**
 * TanStack Query hooks for queue management (PRD-08).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { toastStore } from "@/components/composite/useToast";
import type {
  BulkCancelFilter,
  FullQueueJob,
  GpuQuota,
  JobStateTransition,
  QueueJobFilter,
  QueueStats,
  QueueStatus,
  QuotaStatus,
  SchedulingPolicy,
  SetGpuQuotaInput,
  UpsertSchedulingPolicyInput,
} from "../types";
import type { ComfyUIInstanceInfo } from "@/features/generation/hooks/use-infrastructure";

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
  adminJobs: (filter: QueueJobFilter) =>
    [...queueKeys.all, "admin-jobs", filter] as const,
  stats: () => [...queueKeys.all, "stats"] as const,
  workerInstances: () => [...queueKeys.all, "worker-instances"] as const,
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

/** Cancel a pending or running job. */
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => api.post<unknown>(`/jobs/${jobId}/cancel`),
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

/* --------------------------------------------------------------------------
   Admin: queue jobs (filtered listing)
   -------------------------------------------------------------------------- */

/** Admin polling interval: 5 seconds. */
const ADMIN_POLL_MS = 5_000;

/** Fetches queue jobs with admin-level filters and pagination. */
export function useAdminQueueJobs(filter: QueueJobFilter) {
  const params = new URLSearchParams();
  if (filter.status_ids?.length)
    params.set("status_ids", filter.status_ids.join(","));
  if (filter.instance_id != null)
    params.set("instance_id", String(filter.instance_id));
  if (filter.job_type) params.set("job_type", filter.job_type);
  if (filter.submitted_by != null)
    params.set("submitted_by", String(filter.submitted_by));
  if (filter.sort_by) params.set("sort_by", filter.sort_by);
  if (filter.sort_dir) params.set("sort_dir", filter.sort_dir);
  if (filter.limit != null) params.set("limit", String(filter.limit));
  if (filter.offset != null) params.set("offset", String(filter.offset));

  const qs = params.toString();
  const path = `/admin/queue/jobs${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: queueKeys.adminJobs(filter),
    queryFn: () => api.get<FullQueueJob[]>(path),
    refetchInterval: ADMIN_POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Admin: queue stats
   -------------------------------------------------------------------------- */

/** Fetches aggregate queue statistics with 5-second polling. */
export function useQueueStats() {
  return useQuery({
    queryKey: queueKeys.stats(),
    queryFn: () => api.get<QueueStats>("/admin/queue/stats"),
    refetchInterval: ADMIN_POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Admin: single-job actions
   -------------------------------------------------------------------------- */

/** Hold a job (prevent it from being dispatched). */
export function useHoldJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) =>
      api.post<unknown>(`/admin/jobs/${jobId}/hold`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Job held", variant: "success" });
    },
  });
}

/** Release a held job back into the queue. */
export function useReleaseJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) =>
      api.post<unknown>(`/admin/jobs/${jobId}/release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Job released", variant: "success" });
    },
  });
}

/** Move a job to the front of the queue. */
export function useMoveToFront() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) =>
      api.post<unknown>(`/admin/jobs/${jobId}/move-to-front`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Job moved to front", variant: "success" });
    },
  });
}

/** Reassign a job to a different ComfyUI instance. */
export function useReassignJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobId,
      instanceId,
    }: {
      jobId: number;
      instanceId: number;
    }) =>
      api.post<unknown>(`/admin/jobs/${jobId}/reassign`, {
        instance_id: instanceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Job reassigned", variant: "success" });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: bulk operations
   -------------------------------------------------------------------------- */

/** Cancel multiple jobs matching a filter. */
export function useBulkCancel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filter: BulkCancelFilter) =>
      api.post<{ cancelled_count: number }>("/admin/jobs/bulk-cancel", filter),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: `Cancelled ${data.cancelled_count} jobs`, variant: "success" });
    },
  });
}

/** Redistribute queued jobs across available workers. */
export function useRedistributeQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<unknown>("/admin/jobs/redistribute"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Queue redistributed", variant: "success" });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: worker management
   -------------------------------------------------------------------------- */

/** Put a ComfyUI instance into drain mode (finish current, accept no new). */
export function useDrainWorker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<unknown>(`/admin/comfyui/${instanceId}/drain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Worker draining", variant: "success" });
    },
  });
}

/** Remove a ComfyUI instance from drain mode. */
export function useUndrainWorker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<unknown>(`/admin/comfyui/${instanceId}/undrain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toastStore.addToast({ message: "Worker undrained", variant: "success" });
    },
  });
}

/** Fetch all ComfyUI worker instances (admin view). */
export function useWorkerInstances() {
  return useQuery({
    queryKey: queueKeys.workerInstances(),
    queryFn: () =>
      api.get<ComfyUIInstanceInfo[]>("/admin/comfyui/instances"),
    refetchInterval: ADMIN_POLL_MS,
  });
}
