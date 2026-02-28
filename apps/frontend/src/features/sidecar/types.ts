/**
 * TypeScript types for VFX Sidecar & Dataset Export (PRD-40).
 *
 * These types mirror the backend API response shapes for sidecar templates
 * and dataset exports.
 */

import {
  type JobStatusLabel,
  JOB_STATUS_BADGE_VARIANT,
  JOB_STATUS_LABELS,
  resolveJobStatus,
} from "@/lib/job-status";

/* --------------------------------------------------------------------------
   Sidecar format
   -------------------------------------------------------------------------- */

export type SidecarFormat = "xml" | "csv";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface SidecarTemplate {
  id: number;
  name: string;
  description: string | null;
  format: SidecarFormat;
  target_tool: string | null;
  template_json: Record<string, unknown>;
  is_builtin: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetExport {
  id: number;
  project_id: number;
  name: string;
  config_json: DatasetConfig;
  manifest_json: Record<string, unknown> | null;
  file_path: string | null;
  file_size_bytes: number | null;
  sample_count: number | null;
  status_id: number;
  exported_by: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetConfig {
  quality_threshold?: number;
  scene_types?: string[];
  character_ids?: number[];
  train_split: number;
  validation_split: number;
  test_split: number;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface CreateTemplateInput {
  name: string;
  description?: string;
  format: SidecarFormat;
  target_tool?: string;
  template_json: Record<string, unknown>;
}

export interface CreateDatasetExportInput {
  name: string;
  config_json: DatasetConfig;
}

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const FORMAT_LABELS: Record<SidecarFormat, string> = {
  xml: "XML",
  csv: "CSV",
};

export const TARGET_TOOL_LABELS: Record<string, string> = {
  nuke: "Foundry Nuke",
  after_effects: "After Effects",
  resolve: "DaVinci Resolve",
  custom: "Custom",
};

/* --------------------------------------------------------------------------
   Status styling -- delegates to shared job-status module
   -------------------------------------------------------------------------- */

/** @deprecated Use `JobStatusLabel` from `@/lib/job-status` directly. */
export type ExportStatus = JobStatusLabel;

/** @deprecated Use `JOB_STATUS_BADGE_VARIANT` from `@/lib/job-status`. */
export const EXPORT_STATUS_BADGE_VARIANT = JOB_STATUS_BADGE_VARIANT;

/** @deprecated Use `JOB_STATUS_LABELS` from `@/lib/job-status`. */
export const EXPORT_STATUS_LABELS = JOB_STATUS_LABELS;

/**
 * Resolves a numeric `status_id` to a status label string.
 *
 * @deprecated Use `resolveJobStatus` from `@/lib/job-status` directly.
 */
export const resolveExportStatus = resolveJobStatus;
