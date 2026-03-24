/**
 * Types for Source Image Management & Variant Generation (PRD-21).
 */

/* --------------------------------------------------------------------------
   Media variant status IDs (match database seed order)
   -------------------------------------------------------------------------- */

export const MEDIA_VARIANT_STATUS = {
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
  GENERATING: 4,
  GENERATED: 5,
  EDITING: 6,
} as const;

export type MediaVariantStatusId =
  (typeof MEDIA_VARIANT_STATUS)[keyof typeof MEDIA_VARIANT_STATUS];

/** Human-readable labels for variant statuses. */
export const MEDIA_VARIANT_STATUS_LABEL: Record<MediaVariantStatusId, string> = {
  [MEDIA_VARIANT_STATUS.PENDING]: "Pending",
  [MEDIA_VARIANT_STATUS.APPROVED]: "Approved",
  [MEDIA_VARIANT_STATUS.REJECTED]: "Rejected",
  [MEDIA_VARIANT_STATUS.GENERATING]: "Generating",
  [MEDIA_VARIANT_STATUS.GENERATED]: "Generated",
  [MEDIA_VARIANT_STATUS.EDITING]: "Editing",
};

/** Whether a variant's status allows approval (pending, generated, or editing). */
export function canApproveVariant(statusId: MediaVariantStatusId): boolean {
  return (
    statusId === MEDIA_VARIANT_STATUS.GENERATED ||
    statusId === MEDIA_VARIANT_STATUS.EDITING ||
    statusId === MEDIA_VARIANT_STATUS.PENDING
  );
}

/** Whether a variant's status allows unapproval (approved or rejected). */
export function canUnapproveVariant(statusId: MediaVariantStatusId): boolean {
  return (
    statusId === MEDIA_VARIANT_STATUS.APPROVED ||
    statusId === MEDIA_VARIANT_STATUS.REJECTED
  );
}

/** Map a variant status ID to a Badge component variant for visual consistency. */
export function statusBadgeVariant(
  statusId: MediaVariantStatusId,
): "success" | "danger" | "warning" | "info" | "default" {
  switch (statusId) {
    case MEDIA_VARIANT_STATUS.APPROVED:
      return "success";
    case MEDIA_VARIANT_STATUS.REJECTED:
      return "danger";
    case MEDIA_VARIANT_STATUS.GENERATING:
      return "warning";
    case MEDIA_VARIANT_STATUS.GENERATED:
      return "info";
    case MEDIA_VARIANT_STATUS.EDITING:
      return "warning";
    default:
      return "default";
  }
}

/* --------------------------------------------------------------------------
   Provenance
   -------------------------------------------------------------------------- */

export const PROVENANCE = {
  GENERATED: "generated",
  MANUALLY_EDITED: "manually_edited",
  MANUAL_UPLOAD: "manual_upload",
} as const;

export type Provenance = (typeof PROVENANCE)[keyof typeof PROVENANCE];

/** Human-readable labels for provenance values. */
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  [PROVENANCE.GENERATED]: "Generated",
  [PROVENANCE.MANUALLY_EDITED]: "Manually Edited",
  [PROVENANCE.MANUAL_UPLOAD]: "Manual Upload",
};

/** Preferred variant type for avatars and default track assignment. */
export const PREFERRED_VARIANT_TYPE = "clothed";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface MediaVariant {
  id: number;
  avatar_id: number;
  source_media_id: number | null;
  derived_media_id: number | null;
  variant_label: string;
  status_id: MediaVariantStatusId;
  file_path: string;
  variant_type: string | null;
  provenance: Provenance;
  is_hero: boolean;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  version: number;
  parent_variant_id: number | null;
  generation_params: Record<string, unknown> | null;
  media_kind: "image" | "video" | "audio";
  duration_secs: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMediaVariantInput {
  variant_label: string;
  source_media_id?: number;
  derived_media_id?: number;
  status_id?: MediaVariantStatusId;
  file_path: string;
  variant_type?: string;
  provenance?: string;
  is_hero?: boolean;
  file_size_bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  version?: number;
  parent_variant_id?: number;
  generation_params?: Record<string, unknown>;
}

export interface UpdateMediaVariantInput {
  variant_label?: string;
  source_media_id?: number;
  derived_media_id?: number;
  status_id?: MediaVariantStatusId;
  file_path?: string;
  variant_type?: string;
  provenance?: string;
  is_hero?: boolean;
  file_size_bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  generation_params?: Record<string, unknown>;
}

export interface GenerateVariantsInput {
  variant_type: string;
  variant_label?: string;
  count?: number;
  generation_params?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Valid image formats (mirrors backend VALID_IMAGE_FORMATS)
   -------------------------------------------------------------------------- */

export const VALID_IMAGE_FORMATS = ["png", "jpeg", "jpg", "webp"] as const;
export type ValidImageFormat = (typeof VALID_IMAGE_FORMATS)[number];

/** Comma-separated MIME types derived from VALID_IMAGE_FORMATS, suitable for `<input accept>`. */
export const IMAGE_ACCEPT_STRING = VALID_IMAGE_FORMATS
  .filter((f) => f !== "jpg") // jpg is a duplicate of jpeg
  .map((f) => `image/${f}`)
  .join(",");
