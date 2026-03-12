/**
 * Video settings override types for hierarchical duration/fps/resolution.
 *
 * Settings cascade: Scene Type -> Project -> Group -> Character.
 * Each level can override individual fields; null means "inherit from parent".
 */

export interface VideoSettingsOverride {
  target_duration_secs: number | null;
  target_fps: number | null;
  target_resolution: string | null;
}

export interface ResolvedVideoSettings {
  duration_secs: number;
  duration_source: VideoSettingSource;
  fps: number;
  fps_source: VideoSettingSource;
  resolution: string;
  resolution_source: VideoSettingSource;
}

export type VideoSettingSource = "system_default" | "scene_type" | "project" | "group" | "character";

export const RESOLUTION_OPTIONS = [
  { value: "480p", label: "480p (854x480)" },
  { value: "720p", label: "720p (1280x720)" },
  { value: "1080p", label: "1080p (1920x1080)" },
  { value: "4k", label: "4K (3840x2160)" },
] as const;

export const FPS_OPTIONS = [24, 25, 30, 60] as const;

export const SOURCE_LABELS: Record<VideoSettingSource, string> = {
  system_default: "Default",
  scene_type: "Scene Type",
  project: "Project",
  group: "Group",
  character: "Character",
};

/** Empty override — all values inherit from parent level. */
export const EMPTY_OVERRIDE: VideoSettingsOverride = {
  target_duration_secs: null,
  target_fps: null,
  target_resolution: null,
};
