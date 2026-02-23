/**
 * TypeScript types for the Cost & Resource Estimation feature (PRD-61).
 *
 * These types mirror the backend API response shapes for generation metrics,
 * estimation requests, and estimation results.
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Generation metrics (calibration data)
   -------------------------------------------------------------------------- */

export interface GenerationMetric {
  id: number;
  workflow_id: number;
  resolution_tier_id: number;
  avg_gpu_secs_per_segment: number;
  avg_disk_mb_per_segment: number;
  sample_count: number;
  last_updated_at: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Estimation request
   -------------------------------------------------------------------------- */

export interface SceneEstimateInput {
  workflow_id: number;
  resolution_tier_id: number;
  target_duration_secs: number;
  segment_duration_secs?: number;
}

export interface EstimateRequest {
  scenes: SceneEstimateInput[];
  worker_count?: number;
}

/* --------------------------------------------------------------------------
   Estimation response
   -------------------------------------------------------------------------- */

export type EstimateConfidence = "high" | "medium" | "low" | "none";

export interface SceneEstimate {
  segments_needed: number;
  gpu_seconds: number;
  disk_mb: number;
  confidence: EstimateConfidence;
}

export interface BatchEstimate {
  total_scenes: number;
  total_gpu_hours: number;
  wall_clock_hours: number;
  total_disk_gb: number;
  worker_count: number;
  confidence: EstimateConfidence;
  scene_estimates: SceneEstimate[];
}

/* --------------------------------------------------------------------------
   Constants and helpers
   -------------------------------------------------------------------------- */

/** Human-readable labels for confidence levels. */
export const CONFIDENCE_LABELS: Record<EstimateConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "No estimate available",
};

/** Color tokens mapped to confidence levels for visual indicators. */
export const CONFIDENCE_COLORS: Record<EstimateConfidence, string> = {
  high: "var(--color-action-success)",
  medium: "var(--color-action-warning)",
  low: "var(--color-action-warning)",
  none: "var(--color-text-muted)",
};

/** Map confidence to a Badge variant from the design system (DRY-278). */
export function confidenceBadgeVariant(
  confidence: EstimateConfidence,
): BadgeVariant {
  switch (confidence) {
    case "high":
      return "success";
    case "medium":
      return "warning";
    case "low":
      return "warning";
    case "none":
      return "default";
  }
}
