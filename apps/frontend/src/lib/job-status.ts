/**
 * Shared job status resolution and display constants.
 *
 * The `job_statuses` lookup table is used by multiple features (reports,
 * dataset exports, queue management, render timeline, etc.). This module
 * provides a single canonical mapping from the numeric `status_id` to a
 * string label and badge variant so that each feature does not need to
 * redefine the same mapping.
 *
 * Status IDs match the `job_statuses` seed data (1-based SMALLSERIAL).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Status ID constants (match backend db seed data)
   -------------------------------------------------------------------------- */

export const JOB_STATUS_ID_PENDING = 1;
export const JOB_STATUS_ID_RUNNING = 2;
export const JOB_STATUS_ID_COMPLETED = 3;
export const JOB_STATUS_ID_FAILED = 4;
export const JOB_STATUS_ID_CANCELLED = 5;
export const JOB_STATUS_ID_RETRYING = 6;
export const JOB_STATUS_ID_SCHEDULED = 7;
export const JOB_STATUS_ID_PAUSED = 8;
export const JOB_STATUS_ID_DISPATCHED = 9;
export const JOB_STATUS_ID_HELD = 10;

/* --------------------------------------------------------------------------
   Type
   -------------------------------------------------------------------------- */

/** String union mirroring the four standard job statuses. */
export type JobStatusLabel = "pending" | "running" | "completed" | "failed";

/* --------------------------------------------------------------------------
   Status ID -> string resolution (legacy 4-status)
   -------------------------------------------------------------------------- */

const STATUS_MAP: Record<number, JobStatusLabel> = {
  [JOB_STATUS_ID_PENDING]: "pending",
  [JOB_STATUS_ID_RUNNING]: "running",
  [JOB_STATUS_ID_COMPLETED]: "completed",
  [JOB_STATUS_ID_FAILED]: "failed",
};

/**
 * Resolves a numeric `status_id` from the `job_statuses` lookup table to a
 * human-readable {@link JobStatusLabel} string.  Falls back to `"pending"`.
 */
export function resolveJobStatus(statusId: number): JobStatusLabel {
  return STATUS_MAP[statusId] ?? "pending";
}

/* --------------------------------------------------------------------------
   Full label mapping (all 10 statuses)
   -------------------------------------------------------------------------- */

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const FULL_STATUS_LABELS: Record<number, string> = {
  [JOB_STATUS_ID_PENDING]: "Pending",
  [JOB_STATUS_ID_RUNNING]: "Running",
  [JOB_STATUS_ID_COMPLETED]: "Completed",
  [JOB_STATUS_ID_FAILED]: "Failed",
  [JOB_STATUS_ID_CANCELLED]: "Cancelled",
  [JOB_STATUS_ID_RETRYING]: "Retrying",
  [JOB_STATUS_ID_SCHEDULED]: "Scheduled",
  [JOB_STATUS_ID_PAUSED]: "Paused",
  [JOB_STATUS_ID_DISPATCHED]: "Dispatched",
  [JOB_STATUS_ID_HELD]: "Held",
};

/** Map a job status ID to a human-readable label (all 10 statuses). */
export function jobStatusLabel(statusId: number): string {
  return FULL_STATUS_LABELS[statusId] ?? `Unknown (${statusId})`;
}

/* --------------------------------------------------------------------------
   Badge variant mapping
   -------------------------------------------------------------------------- */

export const JOB_STATUS_BADGE_VARIANT: Record<JobStatusLabel, BadgeVariant> = {
  pending: "default",
  running: "info",
  completed: "success",
  failed: "danger",
};

const FULL_STATUS_BADGE_VARIANT: Record<number, BadgeVariant> = {
  [JOB_STATUS_ID_PENDING]: "default",
  [JOB_STATUS_ID_RUNNING]: "info",
  [JOB_STATUS_ID_COMPLETED]: "success",
  [JOB_STATUS_ID_FAILED]: "danger",
  [JOB_STATUS_ID_CANCELLED]: "default",
  [JOB_STATUS_ID_RETRYING]: "warning",
  [JOB_STATUS_ID_SCHEDULED]: "default",
  [JOB_STATUS_ID_PAUSED]: "warning",
  [JOB_STATUS_ID_DISPATCHED]: "info",
  [JOB_STATUS_ID_HELD]: "warning",
};

/** Map a job status ID to a badge variant (all 10 statuses). */
export function jobStatusBadgeVariant(statusId: number): BadgeVariant {
  return FULL_STATUS_BADGE_VARIANT[statusId] ?? "default";
}
