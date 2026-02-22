/**
 * TypeScript types for the Automated Quality Gates feature (PRD-49).
 *
 * These types mirror the backend API response shapes for quality scores,
 * QA thresholds, and summary DTOs.
 */

/* --------------------------------------------------------------------------
   Quality scores
   -------------------------------------------------------------------------- */

export interface QualityScore {
  id: number;
  segment_id: number;
  check_type: string;
  score: number;
  status: "pass" | "warn" | "fail";
  details: Record<string, unknown> | null;
  threshold_used: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Score summaries
   -------------------------------------------------------------------------- */

export interface QaScoreSummary {
  total_checks: number;
  passed: number;
  warned: number;
  failed: number;
}

export interface SceneQaSummary {
  scene_id: number;
  total_segments: number;
  segments_with_failures: number;
  segments_with_warnings: number;
  all_passed: number;
}

/* --------------------------------------------------------------------------
   QA thresholds
   -------------------------------------------------------------------------- */

export interface QaThreshold {
  id: number;
  project_id: number | null;
  check_type: string;
  warn_threshold: number;
  fail_threshold: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateQaThreshold {
  check_type: string;
  warn_threshold: number;
  fail_threshold: number;
  is_enabled?: boolean;
}

export interface UpdateQaThreshold {
  warn_threshold?: number;
  fail_threshold?: number;
  is_enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Constants and helpers
   -------------------------------------------------------------------------- */

/** Human-readable labels for check types. */
export const CHECK_TYPE_LABELS: Record<string, string> = {
  face_confidence: "Face Confidence",
  boundary_ssim: "Boundary SSIM",
  motion: "Motion",
  resolution: "Resolution",
  artifacts: "Artifacts",
  likeness_drift: "Likeness Drift",
};

/** Map QA status to a Badge variant from the primitives library. */
export function statusBadgeVariant(
  status: string,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warning";
    case "fail":
      return "danger";
    default:
      return "default";
  }
}

/** Map QA status to a Tailwind-compatible color token for traffic lights. */
export function statusColor(status: string): string {
  switch (status) {
    case "pass":
      return "var(--color-action-success)";
    case "warn":
      return "var(--color-action-warning)";
    case "fail":
      return "var(--color-action-danger)";
    default:
      return "var(--color-text-muted)";
  }
}
