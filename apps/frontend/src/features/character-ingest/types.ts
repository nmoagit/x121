/**
 * TypeScript types for the character ingest pipeline (PRD-113).
 *
 * These types mirror the backend API response shapes from
 * `handlers/character_ingest.rs`, `handlers/metadata_template.rs`,
 * `handlers/video_spec.rs`, and `handlers/validation_dashboard.rs`.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Ingest session
   -------------------------------------------------------------------------- */

export interface CharacterIngestSession {
  id: number;
  project_id: number;
  status_id: number;
  source_type: string;
  source_name: string | null;
  target_group_id: number | null;
  total_entries: number;
  ready_count: number;
  error_count: number;
  excluded_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterIngestEntry {
  id: number;
  session_id: number;
  folder_name: string | null;
  parsed_name: string;
  confirmed_name: string | null;
  name_confidence: string | null;
  detected_images: unknown[];
  image_classifications: Record<string, string>;
  metadata_status: string | null;
  metadata_json: Record<string, unknown> | null;
  metadata_source: string | null;
  tov_json: Record<string, unknown> | null;
  bio_json: Record<string, unknown> | null;
  metadata_errors: unknown[];
  validation_status: string | null;
  validation_errors: unknown[];
  validation_warnings: unknown[];
  is_included: boolean;
  created_character_id: number | null;
  script_execution_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface IngestEntryCounts {
  total: number;
  included: number;
  excluded: number;
  pass: number;
  warning: number;
  fail: number;
  pending: number;
}

export interface IngestSessionDetail {
  session: CharacterIngestSession;
  entries: CharacterIngestEntry[];
  counts: IngestEntryCounts;
}

/* --------------------------------------------------------------------------
   Ingest request/response DTOs
   -------------------------------------------------------------------------- */

export interface TextIngestRequest {
  names: string[];
  source_type?: string;
  target_group_id?: number;
}

export interface IngestEntryUpdate {
  confirmed_name?: string;
  image_classifications?: Record<string, string>;
  metadata_json?: Record<string, unknown>;
  is_included?: boolean;
}

export interface IngestValidationSummary {
  total: number;
  pass: number;
  warning: number;
  fail: number;
  pending: number;
}

export interface IngestConfirmResult {
  created: number;
  failed: number;
  skipped: number;
  character_ids: number[];
}

/* --------------------------------------------------------------------------
   Metadata templates
   -------------------------------------------------------------------------- */

export interface MetadataTemplate {
  id: number;
  name: string;
  description: string | null;
  project_id: number | null;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MetadataTemplateField {
  id: number;
  template_id: number;
  field_name: string;
  field_type: string;
  is_required: boolean;
  constraints: Record<string, unknown>;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MetadataTemplateWithFields extends MetadataTemplate {
  fields: MetadataTemplateField[];
}

/* --------------------------------------------------------------------------
   Video specs
   -------------------------------------------------------------------------- */

export interface VideoSpecRequirement {
  id: number;
  name: string;
  project_id: number | null;
  scene_type_id: number | null;
  target_framerate: string | null;
  framerate_tolerance: string | null;
  min_duration_sec: string | null;
  max_duration_sec: string | null;
  target_width: number | null;
  target_height: number | null;
  allowed_codecs: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Validation dashboard
   -------------------------------------------------------------------------- */

export interface ProjectValidationSummary {
  project_id: number;
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  failed_sessions: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Ingest session status IDs. */
export const INGEST_STATUS_LABELS: Record<number, string> = {
  1: "Scanning",
  2: "Preview",
  3: "Generating Metadata",
  4: "Validating",
  5: "Importing",
  6: "Completed",
  7: "Failed",
  8: "Cancelled",
};

/** Name confidence levels. */
export type NameConfidence = "high" | "medium" | "low";

/** Name confidence -> Badge variant mapping (DRY-385). */
export const CONFIDENCE_VARIANT: Record<NameConfidence, BadgeVariant> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

/** Name confidence -> human label (DRY-385). */
export const CONFIDENCE_LABEL: Record<NameConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Metadata status -> Badge variant mapping (DRY-386). */
export const METADATA_STATUS_VARIANT: Record<string, BadgeVariant> = {
  none: "default",
  generating: "info",
  generated: "success",
  failed: "danger",
};

/** Validation status -> Badge variant mapping (DRY-386). */
export const VALIDATION_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pass: "success",
  warning: "warning",
  fail: "danger",
  pending: "default",
};

/** Ingest session status_id -> Badge variant (DRY-386). */
export function ingestSessionBadgeVariant(statusId: number): BadgeVariant {
  if (statusId === 6) return "success";
  if (statusId === 7) return "danger";
  if (statusId === 8) return "default";
  return "info";
}

/** Wizard step definitions. */
export const WIZARD_STEPS = [
  { id: "input", label: "Input" },
  { id: "preview", label: "Preview" },
  { id: "fix", label: "Fix Issues" },
  { id: "confirm", label: "Confirm" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];
