/**
 * Shared job status resolution and display constants.
 *
 * The `job_statuses` lookup table is used by multiple features (reports,
 * dataset exports, etc.).  This module provides a single canonical mapping
 * from the numeric `status_id` to a string label and badge variant so that
 * each feature does not need to redefine the same mapping.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Type
   -------------------------------------------------------------------------- */

/** String union mirroring the four standard job statuses. */
export type JobStatusLabel = "pending" | "running" | "completed" | "failed";

/* --------------------------------------------------------------------------
   Status ID -> string resolution
   -------------------------------------------------------------------------- */

const STATUS_MAP: Record<number, JobStatusLabel> = {
  1: "pending",
  2: "running",
  3: "completed",
  4: "failed",
};

/**
 * Resolves a numeric `status_id` from the `job_statuses` lookup table to a
 * human-readable {@link JobStatusLabel} string.  Falls back to `"pending"`.
 */
export function resolveJobStatus(statusId: number): JobStatusLabel {
  return STATUS_MAP[statusId] ?? "pending";
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

/* --------------------------------------------------------------------------
   Display labels
   -------------------------------------------------------------------------- */

export const JOB_STATUS_LABELS: Record<JobStatusLabel, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};
