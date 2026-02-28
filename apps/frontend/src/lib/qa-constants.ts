/**
 * Shared QA metric label map and helpers.
 *
 * Canonical source for human-readable labels used by quality-gates (PRD-49),
 * auto-retry (PRD-71), and qa-rulesets (PRD-91).
 */

/** Human-readable labels for well-known QA check type metric names. */
export const QA_CHECK_TYPE_LABELS: Record<string, string> = {
  face_confidence: "Face Confidence",
  boundary_ssim: "Boundary SSIM",
  motion: "Motion Continuity",
  resolution: "Resolution",
  artifacts: "Artifacts",
  frame_quality: "Frame Quality",
  likeness_drift: "Likeness Drift",
};

/** Get a display label for a metric, falling back to the raw key. */
export function qaMetricLabel(metric: string): string {
  return QA_CHECK_TYPE_LABELS[metric] ?? metric;
}
