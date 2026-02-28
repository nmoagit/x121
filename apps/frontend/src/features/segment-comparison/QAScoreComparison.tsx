/**
 * Side-by-side QA score display for version comparison (PRD-101).
 *
 * Shows each metric with old -> new scores and a colored diff indicator.
 * Renders an overall summary badge: "Improved", "Degraded", or "Mixed".
 */

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDiff, formatScore, qaMetricLabel } from "@/lib/qa-constants";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QAScoreComparisonProps {
  oldScores: Record<string, number> | null;
  newScores: Record<string, number> | null;
  scoreDiffs: Record<string, number> | null;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

type OverallTrend = "improved" | "degraded" | "mixed";

function computeOverallTrend(diffs: Record<string, number>): OverallTrend {
  const values = Object.values(diffs);
  if (values.length === 0) return "mixed";

  const positiveCount = values.filter((v) => v > 0).length;
  const negativeCount = values.filter((v) => v < 0).length;

  if (negativeCount === 0) return "improved";
  if (positiveCount === 0) return "degraded";
  return "mixed";
}

const TREND_BADGE_VARIANT: Record<OverallTrend, "success" | "danger" | "warning"> = {
  improved: "success",
  degraded: "danger",
  mixed: "warning",
};

const TREND_LABEL: Record<OverallTrend, string> = {
  improved: "Improved",
  degraded: "Degraded",
  mixed: "Mixed",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QAScoreComparison({ oldScores, newScores, scoreDiffs }: QAScoreComparisonProps) {
  // Collect all metric keys across old and new scores.
  const metricKeys = Array.from(
    new Set([...Object.keys(oldScores ?? {}), ...Object.keys(newScores ?? {})]),
  ).sort();

  if (metricKeys.length === 0) {
    return (
      <div data-testid="qa-score-comparison" className="text-sm text-[var(--color-text-muted)]">
        No QA scores available
      </div>
    );
  }

  const trend = scoreDiffs ? computeOverallTrend(scoreDiffs) : null;

  return (
    <div data-testid="qa-score-comparison" className="space-y-2">
      {/* Overall summary */}
      {trend && (
        <div data-testid="qa-overall-trend" className="flex items-center gap-[var(--spacing-2)]">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">Overall:</span>
          <Badge variant={TREND_BADGE_VARIANT[trend]} size="sm">
            {TREND_LABEL[trend]}
          </Badge>
        </div>
      )}

      {/* Per-metric rows */}
      <div className="space-y-1">
        {metricKeys.map((metric) => {
          const oldVal = oldScores?.[metric] ?? null;
          const newVal = newScores?.[metric] ?? null;
          const diff = scoreDiffs?.[metric] ?? null;

          return (
            <div
              key={metric}
              data-testid={`qa-metric-${metric}`}
              className="flex items-center justify-between text-sm gap-[var(--spacing-2)]"
            >
              <span className="text-[var(--color-text-secondary)] truncate min-w-0">
                {qaMetricLabel(metric)}
              </span>

              <div className="flex items-center gap-[var(--spacing-1)] shrink-0 font-mono text-xs">
                {oldVal !== null && (
                  <span className="text-[var(--color-text-muted)]">{formatScore(oldVal)}</span>
                )}

                {oldVal !== null && newVal !== null && (
                  <span className="text-[var(--color-text-muted)]">&rarr;</span>
                )}

                {newVal !== null && (
                  <span className="text-[var(--color-text-primary)]">{formatScore(newVal)}</span>
                )}

                {diff !== null && (
                  <span
                    data-testid={`qa-diff-${metric}`}
                    className={cn(
                      "ml-1",
                      diff > 0 && "text-[var(--color-action-success)]",
                      diff < 0 && "text-[var(--color-action-danger)]",
                      diff === 0 && "text-[var(--color-text-muted)]",
                    )}
                  >
                    ({formatDiff(diff)})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
