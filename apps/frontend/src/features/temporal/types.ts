/**
 * TypeScript types for Temporal Continuity (PRD-26).
 *
 * These types mirror the backend API response shapes for temporal
 * drift, centering, and grain metrics.
 */

/* --------------------------------------------------------------------------
   Metric types
   -------------------------------------------------------------------------- */

export interface TemporalMetric {
  id: number;
  segment_id: number;
  drift_score: number | null;
  centering_offset_x: number | null;
  centering_offset_y: number | null;
  grain_variance: number | null;
  grain_match_score: number | null;
  subject_bbox: Record<string, number> | null;
  analysis_version: string;
  created_at: string;
  updated_at: string;
}

export interface EnrichedTemporalMetric extends TemporalMetric {
  drift_severity: DriftSeverity | null;
  grain_quality: GrainQuality | null;
}

export interface SceneTemporalSummary {
  metrics: EnrichedTemporalMetric[];
  drift_trend: TrendDirection;
}

export interface TemporalTrendPoint {
  segment_id: number;
  drift_score: number | null;
  centering_offset_x: number | null;
  centering_offset_y: number | null;
  grain_match_score: number | null;
}

/* --------------------------------------------------------------------------
   Settings
   -------------------------------------------------------------------------- */

export interface TemporalSetting {
  id: number;
  project_id: number;
  scene_type_id: number | null;
  drift_threshold: number;
  grain_threshold: number;
  centering_threshold: number;
  auto_flag_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemporalSetting {
  scene_type_id?: number | null;
  drift_threshold?: number;
  grain_threshold?: number;
  centering_threshold?: number;
  auto_flag_enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Analysis inputs
   -------------------------------------------------------------------------- */

export interface AnalyzeDriftInput {
  drift_score: number;
  subject_bbox?: Record<string, number> | null;
}

export interface AnalyzeGrainInput {
  grain_variance: number;
  grain_match_score: number;
}

export interface NormalizeGrainInput {
  original_variance: number;
  normalized_variance: number;
  new_match_score: number;
}

/* --------------------------------------------------------------------------
   Enums / constants (matching backend)
   -------------------------------------------------------------------------- */

export type DriftSeverity = "normal" | "warning" | "critical";
export type GrainQuality = "good" | "marginal" | "poor";
export type TrendDirection = "improving" | "stable" | "worsening";

/** Default thresholds matching core constants.
 *  Sync: canonical source is `core/src/temporal_continuity.rs` */
export const DEFAULT_DRIFT_THRESHOLD = 0.15;
export const DEFAULT_GRAIN_THRESHOLD = 0.80;
export const DEFAULT_CENTERING_THRESHOLD = 30.0;

/** Map drift severity to Badge variant. */
export function driftBadgeVariant(
  severity: DriftSeverity,
): "success" | "warning" | "danger" | "default" {
  switch (severity) {
    case "normal":
      return "success";
    case "warning":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "default";
  }
}

/** Map grain quality to Badge variant. */
export function grainBadgeVariant(
  quality: GrainQuality,
): "success" | "warning" | "danger" | "default" {
  switch (quality) {
    case "good":
      return "success";
    case "marginal":
      return "warning";
    case "poor":
      return "danger";
    default:
      return "default";
  }
}

/** Map drift severity to color tokens. */
export const DRIFT_SEVERITY_COLORS: Record<DriftSeverity, string> = {
  normal: "var(--color-action-success)",
  warning: "var(--color-action-warning)",
  critical: "var(--color-action-danger)",
};

/** Map trend direction to human-readable labels. */
export const TREND_LABELS: Record<TrendDirection, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
};
