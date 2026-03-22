/**
 * Content Sensitivity Controls types and constants (PRD-82).
 */

/* --------------------------------------------------------------------------
   Blur levels
   -------------------------------------------------------------------------- */

export type BlurLevel = "full" | "soft_blur" | "heavy_blur" | "placeholder";

/** Ordered from least restrictive to most restrictive. */
export const BLUR_LEVELS: BlurLevel[] = ["full", "soft_blur", "heavy_blur", "placeholder"];

export const BLUR_LEVEL_LABELS: Record<BlurLevel, string> = {
  full: "Full (Unblurred)",
  soft_blur: "Soft Blur",
  heavy_blur: "Heavy Blur",
  placeholder: "Placeholder",
};

/** CSS `filter` values for each blur level. Placeholder uses a silhouette icon instead. */
export const BLUR_CSS: Record<BlurLevel, string> = {
  full: "none",
  soft_blur: "blur(8px)",
  heavy_blur: "blur(24px)",
  placeholder: "none",
};

/* --------------------------------------------------------------------------
   User sensitivity settings
   -------------------------------------------------------------------------- */

export interface UserSensitivitySettings {
  id: number;
  user_id: number;
  global_level: BlurLevel;
  view_overrides_json: Record<string, BlurLevel>;
  watermark_enabled: boolean;
  watermark_text: string | null;
  watermark_position: "center" | "corner";
  watermark_opacity: number;
  screen_share_mode: boolean;
  sound_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertSensitivitySettings {
  global_level: BlurLevel;
  view_overrides_json?: Record<string, BlurLevel>;
  watermark_enabled?: boolean;
  watermark_text?: string | null;
  watermark_position?: "center" | "corner";
  watermark_opacity?: number;
  screen_share_mode?: boolean;
  sound_enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Studio sensitivity config (admin)
   -------------------------------------------------------------------------- */

export interface StudioSensitivityConfig {
  id: number;
  min_level: BlurLevel;
  updated_by: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertStudioConfig {
  min_level: BlurLevel;
}

/* --------------------------------------------------------------------------
   localStorage key
   -------------------------------------------------------------------------- */

export const SENSITIVITY_STORAGE_KEY = "an2n-sensitivity-settings";
