/**
 * TypeScript types for Custom QA Rulesets per Scene Type (PRD-91).
 *
 * These types mirror the backend API response shapes for QA profiles,
 * scene-type overrides, effective thresholds, and A/B test results.
 */

import { TYPO_SECTION_TITLE } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Metric thresholds
   -------------------------------------------------------------------------- */

export interface MetricThreshold {
  warn: number;
  fail: number;
}

/* --------------------------------------------------------------------------
   QA profiles
   -------------------------------------------------------------------------- */

export interface QaProfile {
  id: number;
  name: string;
  description: string | null;
  thresholds: Record<string, MetricThreshold>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateQaProfile {
  name: string;
  description?: string;
  thresholds: Record<string, MetricThreshold>;
}

export interface UpdateQaProfile {
  name?: string;
  description?: string;
  thresholds?: Record<string, MetricThreshold>;
}

/* --------------------------------------------------------------------------
   Scene-type QA overrides
   -------------------------------------------------------------------------- */

export interface SceneTypeQaOverride {
  id: number;
  scene_type_id: number;
  qa_profile_id: number | null;
  custom_thresholds: Record<string, MetricThreshold> | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertSceneTypeQaOverride {
  qa_profile_id?: number | null;
  custom_thresholds?: Record<string, MetricThreshold>;
}

/* --------------------------------------------------------------------------
   A/B threshold testing
   -------------------------------------------------------------------------- */

export interface AbTestRequest {
  scene_type_id: number;
  proposed_thresholds: Record<string, MetricThreshold>;
  window_days?: number;
}

export interface AbTestResult {
  total_segments: number;
  current_pass: number;
  current_warn: number;
  current_fail: number;
  proposed_pass: number;
  proposed_warn: number;
  proposed_fail: number;
  per_metric: MetricAbResult[];
}

export interface MetricAbResult {
  check_type: string;
  current_pass: number;
  current_warn: number;
  current_fail: number;
  proposed_pass: number;
  proposed_warn: number;
  proposed_fail: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/**
 * Human-readable labels for well-known QA metric names.
 * Re-exported from shared `@/lib/qa-constants`.
 */
export {
  QA_CHECK_TYPE_LABELS as QA_METRIC_LABELS,
  qaMetricLabel as metricLabel,
} from "@/lib/qa-constants";

/** Default empty threshold value used as a fallback. */
export const EMPTY_THRESHOLD: MetricThreshold = { warn: 0, fail: 0 };

/** Shared class string for section headings within QA ruleset panels. */
export const SECTION_HEADING_CLASSES = TYPO_SECTION_TITLE;
