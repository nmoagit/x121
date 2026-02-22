/**
 * Scene assembly & delivery packaging types (PRD-39).
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Output format profile types
   -------------------------------------------------------------------------- */

/** An output format profile record from the server. */
export interface OutputFormatProfile {
  id: number;
  name: string;
  description: string | null;
  resolution: string;
  codec: string;
  container: string;
  bitrate_kbps: number | null;
  framerate: number | null;
  pixel_format: string | null;
  extra_ffmpeg_args: string | null;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new output format profile. */
export interface CreateOutputFormatProfile {
  name: string;
  description?: string | null;
  resolution: string;
  codec: string;
  container: string;
  bitrate_kbps?: number | null;
  framerate?: number | null;
  pixel_format?: string | null;
  extra_ffmpeg_args?: string | null;
}

/** Update payload for an existing output format profile. */
export interface UpdateOutputFormatProfile {
  name?: string;
  description?: string | null;
  resolution?: string;
  codec?: string;
  container?: string;
  bitrate_kbps?: number | null;
  framerate?: number | null;
  pixel_format?: string | null;
  extra_ffmpeg_args?: string | null;
}

/* --------------------------------------------------------------------------
   Delivery export types
   -------------------------------------------------------------------------- */

/** A delivery export record from the server. */
export interface DeliveryExport {
  id: number;
  project_id: number;
  format_profile_id: number;
  status_id: number;
  exported_by: number;
  include_watermark: boolean;
  characters_json: unknown | null;
  file_path: string | null;
  file_size_bytes: number | null;
  validation_results_json: unknown | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Request body for starting an assembly job. */
export interface StartAssemblyRequest {
  format_profile_id: number;
  character_ids?: number[] | null;
  include_watermark: boolean;
}

/** Response when an assembly job is started. */
export interface AssemblyStartedResponse {
  export_id: number;
  status: string;
}

/* --------------------------------------------------------------------------
   Validation types
   -------------------------------------------------------------------------- */

/** Response for a delivery validation check. */
export interface DeliveryValidationResponse {
  passed: boolean;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
}

/** A single validation issue. */
export interface ValidationIssue {
  severity: "error" | "warning";
  category: string;
  message: string;
  entity_id: number | null;
}

/* --------------------------------------------------------------------------
   Watermark setting types
   -------------------------------------------------------------------------- */

/** A watermark setting record from the server. */
export interface WatermarkSetting {
  id: number;
  name: string;
  watermark_type: "text" | "image";
  content: string;
  position: string;
  opacity: number;
  include_timecode: boolean;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new watermark setting. */
export interface CreateWatermarkSetting {
  name: string;
  watermark_type: "text" | "image";
  content: string;
  position?: string;
  opacity?: number;
  include_timecode?: boolean;
}

/** Update payload for an existing watermark setting. */
export interface UpdateWatermarkSetting {
  name?: string;
  watermark_type?: "text" | "image";
  content?: string;
  position?: string;
  opacity?: number;
  include_timecode?: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Map severity to Badge variant. */
export const SEVERITY_COLORS: Record<"error" | "warning", BadgeVariant> = {
  error: "danger",
  warning: "warning",
};

/** Export status labels keyed by status_id. */
export const EXPORT_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Assembling",
  3: "Transcoding",
  4: "Packaging",
  5: "Validating",
  6: "Completed",
  7: "Failed",
};

/** Export status to Badge variant mapping. */
export const EXPORT_STATUS_VARIANT: Record<number, BadgeVariant> = {
  1: "default",
  2: "info",
  3: "info",
  4: "info",
  5: "warning",
  6: "success",
  7: "danger",
};
