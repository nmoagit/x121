/**
 * TypeScript types for Avatar Consistency Report (PRD-94).
 *
 * These types mirror the backend API response shapes for consistency
 * reports, pairwise similarity scores, and outlier detection.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Report type
   -------------------------------------------------------------------------- */

export type ConsistencyReportType = "face" | "color" | "full";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface PairwiseScores {
  matrix: number[][];
  scene_ids: number[];
  scene_labels: string[];
}

export interface ConsistencyReport {
  id: number;
  avatar_id: number;
  project_id: number;
  scores_json: PairwiseScores;
  overall_consistency_score: number | null;
  outlier_scene_ids: number[] | null;
  report_type: ConsistencyReportType;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface GenerateConsistencyInput {
  report_type: ConsistencyReportType;
}

export interface BatchConsistencyInput {
  avatar_ids: number[];
  report_type: ConsistencyReportType;
}

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const REPORT_TYPE_LABELS: Record<ConsistencyReportType, string> = {
  face: "Face Similarity",
  color: "Color & Lighting",
  full: "Full Analysis",
};

export const REPORT_TYPE_BADGE_VARIANT: Record<ConsistencyReportType, BadgeVariant> = {
  face: "info",
  color: "warning",
  full: "success",
};

/* --------------------------------------------------------------------------
   Thresholds
   -------------------------------------------------------------------------- */

export const CONSISTENCY_THRESHOLDS = {
  good: 0.85,
  warning: 0.7,
  bad: 0.0,
} as const;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Returns a text color class based on a consistency score. */
export function consistencyColor(score: number): string {
  if (score >= CONSISTENCY_THRESHOLDS.good) return "text-[var(--color-data-green)]";
  if (score >= CONSISTENCY_THRESHOLDS.warning) return "text-yellow-400";
  return "text-[var(--color-data-red)]";
}

/** Returns a background color class based on a consistency score. */
export function consistencyBg(score: number): string {
  if (score >= CONSISTENCY_THRESHOLDS.good) return "bg-green-900/30";
  if (score >= CONSISTENCY_THRESHOLDS.warning) return "bg-yellow-900/30";
  return "bg-red-900/30";
}

/** Returns a cell-level background color class (denser opacity for heatmap cells). */
export function consistencyCellBg(score: number): string {
  if (score >= CONSISTENCY_THRESHOLDS.good) return "bg-green-800/40";
  if (score >= CONSISTENCY_THRESHOLDS.warning) return "bg-yellow-800/40";
  return "bg-red-800/40";
}

/** Returns a Badge variant based on a consistency score. */
export function consistencyBadgeVariant(score: number): BadgeVariant {
  if (score >= CONSISTENCY_THRESHOLDS.good) return "success";
  if (score >= CONSISTENCY_THRESHOLDS.warning) return "warning";
  return "danger";
}
