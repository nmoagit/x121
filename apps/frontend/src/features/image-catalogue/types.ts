/**
 * Image catalogue & image type management types (PRD-154).
 *
 * Mirrors scene-catalogue types with image-specific fields:
 * source/output track associations, prompt templates, and generation params.
 */

import type { Track } from "@/features/scene-catalogue/types";

/* --------------------------------------------------------------------------
   Image type catalogue
   -------------------------------------------------------------------------- */

export interface ImageType {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  pipeline_id: number;
  workflow_id: number | null;
  source_track_id: number | null;
  output_track_id: number | null;
  prompt_template: string | null;
  negative_prompt_template: string | null;
  generation_params: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  tracks: Track[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateImageType {
  name: string;
  slug: string;
  description?: string | null;
  pipeline_id: number;
  workflow_id?: number | null;
  source_track_id?: number | null;
  output_track_id?: number | null;
  prompt_template?: string | null;
  negative_prompt_template?: string | null;
  generation_params?: Record<string, unknown> | null;
  is_active?: boolean;
  sort_order?: number;
  track_ids?: number[];
}

export interface UpdateImageType {
  name?: string;
  description?: string | null;
  workflow_id?: number | null;
  source_track_id?: number | null;
  output_track_id?: number | null;
  prompt_template?: string | null;
  negative_prompt_template?: string | null;
  generation_params?: Record<string, unknown> | null;
  is_active?: boolean;
  sort_order?: number;
  track_ids?: number[];
}

/* --------------------------------------------------------------------------
   Per-track workflow & prompt configuration
   -------------------------------------------------------------------------- */

export interface ImageTypeTrackConfig {
  id: number;
  image_type_id: number;
  track_id: number;
  track_name?: string;
  track_slug?: string;
  workflow_id: number | null;
  prompt_template: string | null;
  negative_prompt_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertImageTrackConfig {
  workflow_id?: number | null;
  prompt_template?: string | null;
  negative_prompt_template?: string | null;
}

/* --------------------------------------------------------------------------
   Avatar image instances
   -------------------------------------------------------------------------- */

/** Status ID constants for avatar images. */
export const IMAGE_STATUS = {
  PENDING: 1,
  GENERATING: 2,
  GENERATED: 3,
  APPROVED: 4,
  REJECTED: 5,
  FAILED: 6,
} as const;

export const IMAGE_STATUS_LABELS: Record<number, string> = {
  [IMAGE_STATUS.PENDING]: "Pending",
  [IMAGE_STATUS.GENERATING]: "Generating",
  [IMAGE_STATUS.GENERATED]: "Generated",
  [IMAGE_STATUS.APPROVED]: "Approved",
  [IMAGE_STATUS.REJECTED]: "Rejected",
  [IMAGE_STATUS.FAILED]: "Failed",
};

export interface AvatarImage {
  id: number;
  avatar_id: number;
  image_type_id: number;
  track_id: number | null;
  media_variant_id: number | null;
  status_id: number;
  generation_started_at: string | null;
  generation_completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvatarImageDetail extends AvatarImage {
  image_type_name: string;
  image_type_slug: string;
  track_name: string | null;
  track_slug: string | null;
  media_variant_url: string | null;
}

export interface CreateAvatarImage {
  image_type_id: number;
  track_id?: number | null;
  media_variant_id?: number | null;
}

export interface UpdateAvatarImage {
  status_id?: number;
  media_variant_id?: number | null;
}

/* --------------------------------------------------------------------------
   Three-tier inheritance settings
   -------------------------------------------------------------------------- */

export interface EffectiveImageSetting {
  image_type_id: number;
  name: string;
  slug: string;
  is_enabled: boolean;
  source: "image_type" | "project" | "group" | "avatar";
  track_id: number | null;
  track_name: string | null;
  track_slug: string | null;
}

export interface ImageSettingUpdate {
  image_type_id: number;
  track_id?: number | null;
  is_enabled: boolean;
}

/* --------------------------------------------------------------------------
   URL helper: build image-setting toggle/delete URL with optional track
   -------------------------------------------------------------------------- */

/**
 * Builds the API URL for a single image setting toggle or delete.
 *
 * @param basePath - e.g. `/projects/5/image-settings` or `/avatars/12/image-settings`
 * @param imageTypeId - the image type to target
 * @param trackId - optional track qualifier (null targets the image_type level)
 */
export function imageSettingUrl(
  basePath: string,
  imageTypeId: number,
  trackId: number | null | undefined,
): string {
  const base = `${basePath}/${imageTypeId}`;
  return trackId != null ? `${base}/tracks/${trackId}` : base;
}
