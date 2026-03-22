/**
 * TypeScript types for queue management & job scheduling (PRD-08, PRD-132).
 *
 * These types mirror the backend API response shapes.
 */

import {
  JOB_STATUS_ID_PENDING,
  JOB_STATUS_ID_RUNNING,
  JOB_STATUS_ID_COMPLETED,
  JOB_STATUS_ID_FAILED,
  JOB_STATUS_ID_CANCELLED,
  JOB_STATUS_ID_RETRYING,
  JOB_STATUS_ID_SCHEDULED,
  JOB_STATUS_ID_PAUSED,
  JOB_STATUS_ID_HELD,
  jobStatusLabel,
  jobStatusBadgeVariant,
} from "@/lib/job-status";

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
  // Enriched context from backend JOINs.
  scene_id: number | null;
  character_id: number | null;
  project_id: number | null;
  character_name: string | null;
  scene_type_name: string | null;
  track_name: string | null;
  // Job kind discriminator + image-generation context.
  job_kind: "scene" | "image" | "other" | null;
  source_variant_type: string | null;
  target_variant_type: string | null;
  // Pipeline context (PRD-139).
  pipeline_id: number | null;
  pipeline_code: string | null;
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
  /** Filter by pipeline (PRD-139). */
  pipeline_id?: number;
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
   Job status constants & helpers — re-exported from canonical source
   -------------------------------------------------------------------------- */

/** @deprecated Use JOB_STATUS_ID_PENDING from @/lib/job-status */
export const JOB_STATUS_PENDING = JOB_STATUS_ID_PENDING;
/** Note: "Queued" is mapped to Running (id=2) in the backend seed data. */
export const JOB_STATUS_QUEUED = JOB_STATUS_ID_RUNNING;
export const JOB_STATUS_RUNNING = JOB_STATUS_ID_RUNNING;
export const JOB_STATUS_COMPLETED = JOB_STATUS_ID_COMPLETED;
export const JOB_STATUS_FAILED = JOB_STATUS_ID_FAILED;
export const JOB_STATUS_CANCELLED = JOB_STATUS_ID_CANCELLED;
export const JOB_STATUS_PAUSED = JOB_STATUS_ID_PAUSED;
export const JOB_STATUS_SCHEDULED = JOB_STATUS_ID_SCHEDULED;
export const JOB_STATUS_RETRYING = JOB_STATUS_ID_RETRYING;
export const JOB_STATUS_HELD = JOB_STATUS_ID_HELD;

/** Map a job status ID to a human-readable label. Delegates to canonical source. */
export const statusLabel = jobStatusLabel;

/** Map a job status ID to a badge variant for consistent styling. Delegates to canonical source. */
export const statusColor = jobStatusBadgeVariant;
