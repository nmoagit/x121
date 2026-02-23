/**
 * Batch Production Orchestrator types (PRD-57).
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Production run types
   -------------------------------------------------------------------------- */

/** A production run record from the server. */
export interface ProductionRun {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  matrix_config: MatrixConfig;
  status_id: number;
  total_cells: number;
  completed_cells: number;
  failed_cells: number;
  estimated_gpu_hours: number | null;
  estimated_disk_gb: number | null;
  created_by_id: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Matrix configuration stored in the run. */
export interface MatrixConfig {
  character_ids: number[];
  scene_type_ids: number[];
}

/** A production run cell from the server. */
export interface ProductionRunCell {
  id: number;
  run_id: number;
  character_id: number;
  scene_type_id: number;
  variant_label: string;
  status_id: number;
  scene_id: number | null;
  job_id: number | null;
  blocking_reason: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request / response types
   -------------------------------------------------------------------------- */

/** Request body for creating a new production run. */
export interface CreateProductionRunRequest {
  project_id: number;
  name: string;
  description?: string | null;
  character_ids: number[];
  scene_type_ids: number[];
  estimated_gpu_hours?: number | null;
  estimated_disk_gb?: number | null;
}

/** Request body for submitting cells. */
export interface SubmitCellsRequest {
  cell_ids?: number[] | null;
}

/** Aggregate progress statistics. */
export interface ProductionRunProgress {
  run_id: number;
  total_cells: number;
  completed_cells: number;
  failed_cells: number;
  in_progress_cells: number;
  not_started_cells: number;
  completion_pct: number;
}

/* --------------------------------------------------------------------------
   Cell status enum (mirrors core CellStatus)
   -------------------------------------------------------------------------- */

export type CellStatus =
  | "not_started"
  | "blocked"
  | "queued"
  | "generating"
  | "qa_review"
  | "approved"
  | "failed"
  | "rejected"
  | "delivered";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Cell status labels for display. */
export const CELL_STATUS_LABELS: Record<CellStatus, string> = {
  not_started: "Not Started",
  blocked: "Blocked",
  queued: "Queued",
  generating: "Generating",
  qa_review: "QA Review",
  approved: "Approved",
  failed: "Failed",
  rejected: "Rejected",
  delivered: "Delivered",
};

/** Cell status to Badge variant mapping. */
export const CELL_STATUS_VARIANT: Record<CellStatus, BadgeVariant> = {
  not_started: "default",
  blocked: "warning",
  queued: "info",
  generating: "info",
  qa_review: "warning",
  approved: "success",
  failed: "danger",
  rejected: "danger",
  delivered: "success",
};

/** Run status labels keyed by status_id (maps to job_statuses). */
export const RUN_STATUS_LABELS: Record<number, string> = {
  1: "Draft",
  2: "In Progress",
  3: "Completed",
  4: "Failed",
  5: "Cancelled",
};

/** Run status to Badge variant mapping. */
export const RUN_STATUS_VARIANT: Record<number, BadgeVariant> = {
  1: "default",
  2: "info",
  3: "success",
  4: "danger",
  5: "warning",
};

/** Map cell status_id to CellStatus string for display. */
export const CELL_STATUS_BY_ID: Record<number, CellStatus> = {
  1: "not_started",
  2: "queued",
  3: "approved",
  4: "failed",
};
