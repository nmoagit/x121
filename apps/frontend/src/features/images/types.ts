/**
 * Types for Source Image Management & Variant Generation (PRD-21).
 */

/* --------------------------------------------------------------------------
   Image variant status IDs (match database seed order)
   -------------------------------------------------------------------------- */

export const IMAGE_VARIANT_STATUS = {
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
  GENERATING: 4,
  GENERATED: 5,
  EDITING: 6,
} as const;

export type ImageVariantStatusId =
  (typeof IMAGE_VARIANT_STATUS)[keyof typeof IMAGE_VARIANT_STATUS];

/** Human-readable labels for variant statuses. */
export const IMAGE_VARIANT_STATUS_LABEL: Record<ImageVariantStatusId, string> = {
  [IMAGE_VARIANT_STATUS.PENDING]: "Pending",
  [IMAGE_VARIANT_STATUS.APPROVED]: "Approved",
  [IMAGE_VARIANT_STATUS.REJECTED]: "Rejected",
  [IMAGE_VARIANT_STATUS.GENERATING]: "Generating",
  [IMAGE_VARIANT_STATUS.GENERATED]: "Generated",
  [IMAGE_VARIANT_STATUS.EDITING]: "Editing",
};

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

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface ImageVariant {
  id: number;
  character_id: number;
  source_image_id: number | null;
  derived_image_id: number | null;
  variant_label: string;
  status_id: ImageVariantStatusId;
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
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateImageVariantInput {
  variant_label: string;
  source_image_id?: number;
  derived_image_id?: number;
  status_id?: ImageVariantStatusId;
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

export interface UpdateImageVariantInput {
  variant_label?: string;
  source_image_id?: number;
  derived_image_id?: number;
  status_id?: ImageVariantStatusId;
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
