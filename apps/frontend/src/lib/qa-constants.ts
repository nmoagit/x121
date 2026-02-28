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

/** Format a QA score to 2 decimal places (e.g. 0.85 -> "0.85"). */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

/** Format a score diff with sign prefix (e.g. 0.05 -> "+0.05", -0.07 -> "-0.07"). */
export function formatDiff(diff: number): string {
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}`;
}
