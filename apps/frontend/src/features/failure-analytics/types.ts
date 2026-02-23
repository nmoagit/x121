/**
 * TypeScript types for Failure Pattern Tracking & Insights (PRD-64).
 *
 * These types mirror the backend API response shapes for failure patterns,
 * pattern fixes, heatmap data, trends, and alerts.
 */

/* --------------------------------------------------------------------------
   Failure patterns
   -------------------------------------------------------------------------- */

export interface FailurePattern {
  id: number;
  pattern_key: string;
  description: string | null;
  dimension_workflow_id: number | null;
  dimension_lora_id: number | null;
  dimension_character_id: number | null;
  dimension_scene_type_id: number | null;
  dimension_segment_position: string | null;
  failure_count: number;
  total_count: number;
  failure_rate: number;
  severity: "high" | "medium" | "low";
  last_occurrence: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Pattern fixes
   -------------------------------------------------------------------------- */

export interface PatternFix {
  id: number;
  pattern_id: number;
  fix_description: string;
  fix_parameters: Record<string, unknown> | null;
  effectiveness: "resolved" | "improved" | "no_effect" | null;
  reported_by_id: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePatternFix {
  fix_description: string;
  fix_parameters?: Record<string, unknown> | null;
  effectiveness?: string | null;
}

/* --------------------------------------------------------------------------
   Heatmap
   -------------------------------------------------------------------------- */

export interface HeatmapCell {
  row: string;
  col: string;
  failure_rate: number;
  sample_count: number;
  severity: "high" | "medium" | "low";
}

export interface HeatmapData {
  cells: HeatmapCell[];
  row_labels: string[];
  col_labels: string[];
}

/* --------------------------------------------------------------------------
   Trends
   -------------------------------------------------------------------------- */

export interface TrendPoint {
  period: string;
  failure_rate: number;
  sample_count: number;
}

/* --------------------------------------------------------------------------
   Alerts
   -------------------------------------------------------------------------- */

/** Alert response is simply a list of high-severity matching patterns. */
export type AlertResponse = FailurePattern[];

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Available dimension options for heatmap axes. */
export const HEATMAP_DIMENSIONS = [
  { value: "workflow", label: "Workflow" },
  { value: "character", label: "Character" },
  { value: "scene_type", label: "Scene Type" },
  { value: "lora", label: "LoRA" },
  { value: "segment_position", label: "Segment Position" },
] as const;

/** Period options for trend charts. */
export const TREND_PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
] as const;

/** Map severity to a Badge variant. */
export function severityBadgeVariant(
  severity: string,
): "success" | "warning" | "danger" | "default" {
  switch (severity) {
    case "high":
      return "danger";
    case "medium":
      return "warning";
    case "low":
      return "success";
    default:
      return "default";
  }
}
