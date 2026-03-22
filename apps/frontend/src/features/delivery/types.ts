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
  is_default: boolean;
  is_passthrough: boolean;
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

/** Format a profile as a select option label: "Name (resolution, codec)". */
export function formatProfileOption(p: OutputFormatProfile): { value: string; label: string } {
  return { value: String(p.id), label: `${p.name} (${p.resolution}, ${p.codec})` };
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
  avatars_json: unknown | null;
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
  avatar_ids?: number[] | null;
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
  severity: "error" | "warning" | "info";
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
   Delivery log types (PRD-39 Amendment A.3)
   -------------------------------------------------------------------------- */

/** A delivery log entry from the server. */
export interface DeliveryLog {
  id: number;
  delivery_export_id: number | null;
  project_id: number;
  log_level: "info" | "warning" | "error";
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Delivery status types (PRD-39 Amendment A.4)
   -------------------------------------------------------------------------- */

/** Per-avatar delivery status. */
export interface AvatarDeliveryStatus {
  avatar_id: number;
  avatar_name: string;
  status: "delivered" | "needs_redelivery" | "not_delivered";
  last_delivered_at: string | null;
  /** ID of the latest completed export containing this avatar. */
  export_id: number | null;
}

/** Map delivery status to Badge variant. */
export const DELIVERY_STATUS_VARIANT: Record<
  AvatarDeliveryStatus["status"],
  BadgeVariant
> = {
  delivered: "success",
  needs_redelivery: "warning",
  not_delivered: "default",
};

/** Map delivery status to display label. */
export const DELIVERY_STATUS_LABELS: Record<
  AvatarDeliveryStatus["status"],
  string
> = {
  delivered: "Delivered",
  needs_redelivery: "Needs Re-delivery",
  not_delivered: "Not Delivered",
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Map severity to Badge variant. */
export const SEVERITY_COLORS: Record<"error" | "warning", BadgeVariant> = {
  error: "danger",
  warning: "warning",
};

/** Map log level to Badge variant (superset of SEVERITY_COLORS with "info"). */
export const LOG_LEVEL_BADGE_VARIANT: Record<string, BadgeVariant> = {
  error: "danger",
  warning: "warning",
  info: "info",
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

/* --------------------------------------------------------------------------
   Delivery destination types (PRD-039 Amendment A.1)
   -------------------------------------------------------------------------- */

/** A delivery destination record from the server. */
export interface DeliveryDestination {
  id: number;
  project_id: number;
  destination_type_id: number;
  label: string;
  config: Record<string, unknown>;
  is_enabled: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new delivery destination. */
export interface CreateDeliveryDestination {
  destination_type_id: number;
  label: string;
  config?: Record<string, unknown>;
  is_enabled?: boolean;
}

/** Update payload for an existing delivery destination. */
export interface UpdateDeliveryDestination {
  label?: string;
  destination_type_id?: number;
  config?: Record<string, unknown>;
  is_enabled?: boolean;
}

/** Map destination type IDs to human-readable labels. */
export const DESTINATION_TYPE_LABELS: Record<number, string> = {
  1: "Local",
  2: "S3",
  3: "Google Drive",
};
