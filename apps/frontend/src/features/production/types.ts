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

/** A production run cell from the server (matrix endpoint includes names). */
export interface ProductionRunCell {
  id: number;
  run_id: number;
  character_id: number;
  scene_type_id: number;
  track_id: number | null;
  variant_label: string;
  status_id: number;
  scene_id: number | null;
  job_id: number | null;
  blocking_reason: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /** Scene type name — present in matrix response. */
  scene_type_name?: string;
  /** Track name — present in matrix response when track_id is set. */
  track_name?: string | null;
  /** Whether a matching seed image exists for this character + track. */
  has_seed?: boolean;
  /** Whether this scene type has a clothes-off transition. */
  has_clothes_off_transition?: boolean;
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
  /** When true, check for existing approved scenes and pre-mark those cells as completed. */
  retrospective?: boolean;
}

/** An entry from the enabled-scene-types endpoint. */
export interface EnabledSceneTypeEntry {
  character_id: number;
  scene_type_id: number;
  scene_type_name: string;
  track_id: number | null;
  track_name: string | null;
  has_clothes_off_transition: boolean;
}

/** Deduplicated scene slot (union of enabled scene type entries across characters). */
export interface SceneSlotInfo {
  key: string;
  scene_type_id: number;
  track_id: number | null;
  label: string;
  has_clothes_off_transition: boolean;
}

/** Build a display label for a scene+track combo (shared by matrix views and run creation). */
export function buildSceneSlotLabel(entry: {
  scene_type_name: string;
  track_name: string | null;
  has_clothes_off_transition: boolean;
}): string {
  if (entry.has_clothes_off_transition) return `${entry.scene_type_name} - Clothes Off`;
  if (entry.track_name) return `${entry.scene_type_name} - ${entry.track_name}`;
  return entry.scene_type_name;
}

/** Build a consistent composite key for a scene_type + track pair. */
export function sceneSlotKey(sceneTypeId: number, trackId: number | null): string {
  return `${sceneTypeId}-${trackId ?? "null"}`;
}

/** Deduplicate enabled scene type entries into unique scene+track slots, sorted by label. */
export function deduplicateSceneSlots(entries: EnabledSceneTypeEntry[]): SceneSlotInfo[] {
  const seen = new Map<string, SceneSlotInfo>();
  for (const entry of entries) {
    const key = sceneSlotKey(entry.scene_type_id, entry.track_id);
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        scene_type_id: entry.scene_type_id,
        track_id: entry.track_id,
        label: buildSceneSlotLabel(entry),
        has_clothes_off_transition: entry.has_clothes_off_transition,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
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
  | "no_seed"
  | "blocked"
  | "queued"
  | "in_progress"
  | "generating"
  | "qa_review"
  | "approved"
  | "failed"
  | "rejected"
  | "delivered"
  | "skipped";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Cell status labels for display. */
export const CELL_STATUS_LABELS: Record<CellStatus, string> = {
  not_started: "Not Started",
  no_seed: "No Seed",
  blocked: "Blocked",
  queued: "Queued",
  in_progress: "In Progress",
  generating: "Generating",
  qa_review: "QA Review",
  approved: "Approved",
  failed: "Failed",
  rejected: "Rejected",
  delivered: "Delivered",
  skipped: "Skipped",
};

/** Cell status to Badge variant mapping. */
export const CELL_STATUS_VARIANT: Record<CellStatus, BadgeVariant> = {
  not_started: "default",
  no_seed: "warning",
  blocked: "warning",
  queued: "info",
  in_progress: "info",
  generating: "info",
  qa_review: "warning",
  approved: "success",
  failed: "danger",
  rejected: "danger",
  delivered: "success",
  skipped: "default",
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
