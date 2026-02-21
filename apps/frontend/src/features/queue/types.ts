/**
 * TypeScript types for queue management & job scheduling (PRD-08).
 *
 * These types mirror the backend API response shapes.
 */

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
