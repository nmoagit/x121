/**
 * TypeScript types for queue management & job scheduling (PRD-08, PRD-132).
 *
 * These types mirror the backend API response shapes.
 */

import type { BadgeVariant } from "@/components/primitives/Badge";

/* --------------------------------------------------------------------------
   Queue status
   -------------------------------------------------------------------------- */

export interface QueuedJob {
  id: number;
  job_type: string;
  priority: number;
  submitted_by: number;
  submitted_at: string;
  queue_position: number | null;
  scheduled_start_at: string | null;
  is_off_peak_only: boolean;
  is_paused: boolean;
}

export interface QueueStatus {
  total_queued: number;
  total_running: number;
  total_scheduled: number;
  estimated_wait_secs: number | null;
  jobs: QueuedJob[];
}

/* --------------------------------------------------------------------------
   Quota
   -------------------------------------------------------------------------- */

export type QuotaStatus =
  | { status: "no_quota" }
  | {
      status: "within_limits";
      used_today_secs: number;
      daily_limit_secs: number | null;
      used_this_week_secs: number;
      weekly_limit_secs: number | null;
    }
  | {
      status: "exceeded";
      used_today_secs: number;
      daily_limit_secs: number | null;
      used_this_week_secs: number;
      weekly_limit_secs: number | null;
      exceeded_type: string;
    };

export interface GpuQuota {
  id: number;
  user_id: number | null;
  project_id: number | null;
  daily_limit_secs: number | null;
  weekly_limit_secs: number | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SetGpuQuotaInput {
  daily_limit_secs: number | null;
  weekly_limit_secs: number | null;
  is_enabled: boolean;
}

/* --------------------------------------------------------------------------
   Scheduling policies
   -------------------------------------------------------------------------- */

export interface SchedulingPolicy {
  id: number;
  name: string;
  policy_type: string;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertSchedulingPolicyInput {
  name: string;
  policy_type: string;
  config: Record<string, unknown>;
  is_enabled: boolean;
}

/* --------------------------------------------------------------------------
   Job state transitions
   -------------------------------------------------------------------------- */

export interface JobStateTransition {
  id: number;
  job_id: number;
  from_status_id: number;
  to_status_id: number;
  triggered_by: number | null;
  reason: string | null;
  transitioned_at: string;
}

/* --------------------------------------------------------------------------
   Full queue job (admin view)
   -------------------------------------------------------------------------- */

export interface FullQueueJob {
  id: number;
  job_type: string;
  status_id: number;
  priority: number;
  submitted_by: number;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  actual_duration_secs: number | null;
  error_message: string | null;
  comfyui_instance_id: number | null;
  is_paused: boolean;
  progress_percent: number;
  parameters: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Queue stats & worker load
   -------------------------------------------------------------------------- */

export interface WorkerLoad {
  instance_id: number;
  name: string;
  active_jobs: number;
  drain_mode: boolean;
}

export interface QueueStats {
  counts_by_status: Record<string, number>;
  avg_wait_secs: number | null;
  avg_execution_secs: number | null;
  throughput_per_hour: number;
  per_worker_load: WorkerLoad[];
}

/* --------------------------------------------------------------------------
   Admin filters
   -------------------------------------------------------------------------- */

export interface BulkCancelFilter {
  scene_id?: number;
  character_id?: number;
  project_id?: number;
  submitted_by?: number;
  status_ids?: number[];
}

export interface QueueJobFilter {
  status_ids?: number[];
  instance_id?: number;
  job_type?: string;
  submitted_by?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/* --------------------------------------------------------------------------
   Priority constants (match backend)
   -------------------------------------------------------------------------- */

export const PRIORITY_URGENT = 10;
export const PRIORITY_NORMAL = 0;
export const PRIORITY_BACKGROUND = -10;

/** Map priority value to a human-readable label. */
export function priorityLabel(priority: number): string {
  if (priority >= PRIORITY_URGENT) return "Urgent";
  if (priority <= PRIORITY_BACKGROUND) return "Background";
  return "Normal";
}

/** Map priority value to a Tailwind-compatible color token. */
export function priorityColor(priority: number): string {
  if (priority >= PRIORITY_URGENT) return "var(--color-status-error)";
  if (priority <= PRIORITY_BACKGROUND) return "var(--color-text-muted)";
  return "var(--color-status-info)";
}

/* --------------------------------------------------------------------------
   Job status constants & helpers (match backend status lookup table)
   -------------------------------------------------------------------------- */

export const JOB_STATUS_PENDING = 1;
export const JOB_STATUS_QUEUED = 2;
export const JOB_STATUS_RUNNING = 3;
export const JOB_STATUS_COMPLETED = 4;
export const JOB_STATUS_FAILED = 5;
export const JOB_STATUS_CANCELLED = 6;
export const JOB_STATUS_PAUSED = 7;
export const JOB_STATUS_SCHEDULED = 8;
export const JOB_STATUS_RETRYING = 9;
export const JOB_STATUS_HELD = 10;

const STATUS_LABELS: Record<number, string> = {
  [JOB_STATUS_PENDING]: "Pending",
  [JOB_STATUS_QUEUED]: "Queued",
  [JOB_STATUS_RUNNING]: "Running",
  [JOB_STATUS_COMPLETED]: "Completed",
  [JOB_STATUS_FAILED]: "Failed",
  [JOB_STATUS_CANCELLED]: "Cancelled",
  [JOB_STATUS_PAUSED]: "Paused",
  [JOB_STATUS_SCHEDULED]: "Scheduled",
  [JOB_STATUS_RETRYING]: "Retrying",
  [JOB_STATUS_HELD]: "Held",
};

/** Map a job status ID to a human-readable label. */
export function statusLabel(statusId: number): string {
  return STATUS_LABELS[statusId] ?? `Unknown (${statusId})`;
}

const STATUS_COLORS: Record<number, BadgeVariant> = {
  [JOB_STATUS_PENDING]: "default",
  [JOB_STATUS_QUEUED]: "info",
  [JOB_STATUS_RUNNING]: "info",
  [JOB_STATUS_COMPLETED]: "success",
  [JOB_STATUS_FAILED]: "danger",
  [JOB_STATUS_CANCELLED]: "default",
  [JOB_STATUS_PAUSED]: "warning",
  [JOB_STATUS_SCHEDULED]: "default",
  [JOB_STATUS_RETRYING]: "warning",
  [JOB_STATUS_HELD]: "warning",
};

/** Map a job status ID to a badge variant for consistent styling. */
export function statusColor(statusId: number): BadgeVariant {
  return STATUS_COLORS[statusId] ?? "default";
}
