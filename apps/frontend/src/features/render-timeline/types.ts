/**
 * TypeScript types for render queue timeline / Gantt view (PRD-90).
 *
 * These types mirror the backend API response shapes for the timeline endpoint.
 * Job status resolution uses the canonical `resolveJobStatus` from `@/lib/job-status`.
 * Worker status display uses `WORKER_STATUS_LABELS` / `WORKER_STATUS_VARIANT` from
 * `@/features/workers/types`.
 */

import {
  JOB_STATUS_BADGE_VARIANT as CANONICAL_BADGE_VARIANT,
  type JobStatusLabel,
  resolveJobStatus,
} from "@/lib/job-status";

/* --------------------------------------------------------------------------
   Timeline job (mirrors backend TimelineJobResponse)
   -------------------------------------------------------------------------- */

export interface TimelineJob {
  /** Backend field: `job_id`. */
  job_id: number;
  worker_id: number | null;
  worker_name: string | null;
  status_id: number;
  priority: number;
  job_type: string;
  progress_percent: number;
  /** Pre-computed start time from lane assignment (ISO 8601). */
  start: string;
  /** Pre-computed end time from lane assignment (ISO 8601). */
  end: string;
  /** Lane index (0 = unassigned, 1..N = workers). */
  lane: number;
}

/* --------------------------------------------------------------------------
   Worker lane (mirrors backend WorkerLaneResponse)
   -------------------------------------------------------------------------- */

export interface WorkerLane {
  id: number;
  name: string;
  /** Worker status_id (from worker_statuses table, NOT job_statuses). */
  status_id: number;
  current_job_id: number | null;
}

/* --------------------------------------------------------------------------
   Timeline data (API response -- mirrors backend TimelineResponse)
   -------------------------------------------------------------------------- */

export interface TimelineData {
  zoom: string;
  from: string;
  to: string;
  workers: WorkerLane[];
  jobs: TimelineJob[];
  idle_workers: number;
  busy_workers: number;
}

/* --------------------------------------------------------------------------
   Zoom levels
   -------------------------------------------------------------------------- */

export type ZoomLevel = "1h" | "6h" | "24h" | "7d";

export const ZOOM_LEVELS: { label: string; value: ZoomLevel }[] = [
  { label: "1 Hour", value: "1h" },
  { label: "6 Hours", value: "6h" },
  { label: "24 Hours", value: "24h" },
  { label: "7 Days", value: "7d" },
];

/* --------------------------------------------------------------------------
   Job status display constants
   Uses canonical resolveJobStatus from @/lib/job-status (DRY audit).
   -------------------------------------------------------------------------- */

/** Re-export for convenience within this feature. */
export { resolveJobStatus };
export type { JobStatusLabel };

/** Gantt bar colors keyed by job status name. */
export const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "var(--color-action-warning)",
  running: "var(--color-action-primary)",
  completed: "var(--color-action-success)",
  failed: "var(--color-action-danger)",
};

/**
 * Re-export canonical badge variant mapping.
 * Use `WORKER_STATUS_VARIANT` from `@/features/workers/types` for worker badges.
 */
export const JOB_STATUS_BADGE_VARIANT = CANONICAL_BADGE_VARIANT;
