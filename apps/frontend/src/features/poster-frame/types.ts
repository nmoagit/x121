/**
 * Poster Frame & Thumbnail Selection types (PRD-96).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A poster frame record from the server. */
export interface PosterFrame {
  id: number;
  entity_type: "avatar" | "scene";
  entity_id: number;
  segment_id: number;
  frame_number: number;
  image_path: string;
  crop_settings_json: CropSettings | null;
  brightness: number;
  contrast: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** Crop region and aspect ratio for a poster frame. */
export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating or replacing a poster frame. */
export interface UpsertPosterFrame {
  segment_id: number;
  frame_number: number;
  image_path: string;
  crop_settings_json?: CropSettings;
  brightness?: number;
  contrast?: number;
}

/** Request body for updating crop/brightness/contrast adjustments. */
export interface UpdatePosterFrameAdjustments {
  crop_settings_json?: CropSettings;
  brightness?: number;
  contrast?: number;
}

/** Result from the auto-select endpoint for a single avatar. */
export interface AutoSelectResult {
  avatar_id: number;
  segment_id: number | null;
  selected: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

export const ENTITY_TYPE_CHARACTER = "avatar" as const;
export const ENTITY_TYPE_SCENE = "scene" as const;

export const ASPECT_RATIO_OPTIONS = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "16:9", label: "Widescreen (16:9)" },
  { value: "4:3", label: "Standard (4:3)" },
  { value: "custom", label: "Custom" },
] as const;

export const DEFAULT_BRIGHTNESS = 1.0;
export const DEFAULT_CONTRAST = 1.0;

export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.5;
export const BRIGHTNESS_STEP = 0.05;

export const CONTRAST_MIN = 0.5;
export const CONTRAST_MAX = 1.5;
export const CONTRAST_STEP = 0.05;
