/**
 * Score diff display for regression results (PRD-65).
 *
 * Renders a table showing metric-by-metric baseline vs new scores
 * with color-coded diffs (green for positive, red for negative).
 */

import { cn } from "@/lib/cn";
import { formatDiff, formatScore, qaMetricLabel } from "@/lib/qa-constants";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ScoreDiffDisplayProps {
  baselineScores: Record<string, number>;
  newScores: Record<string, number>;
  scoreDiffs: Record<string, number>;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScoreDiffDisplay({
  baselineScores,
  newScores,
  scoreDiffs,
}: ScoreDiffDisplayProps) {
  const metricKeys = Array.from(
    new Set([
      ...Object.keys(baselineScores),
      ...Object.keys(newScores),
    ]),
  ).sort();

  if (metricKeys.length === 0) {
    return (
      <div
        data-testid="score-diff-display"
        className="text-sm text-[var(--color-text-muted)]"
      >
        No score data available
      </div>
    );
  }

  return (
    <table data-testid="score-diff-display" className="w-full text-sm">
      <thead>
        <tr className="text-[var(--color-text-secondary)] text-left">
          <th className="pb-1 font-medium">Metric</th>
          <th className="pb-1 font-medium text-right">Baseline</th>
          <th className="pb-1 font-medium text-right">New</th>
          <th className="pb-1 font-medium text-right">Diff</th>
        </tr>
      </thead>
      <tbody>
        {metricKeys.map((metric) => {
          const baseline = baselineScores[metric] ?? null;
          const newVal = newScores[metric] ?? null;
          const diff = scoreDiffs[metric] ?? null;

          return (
            <tr
              key={metric}
              data-testid={`score-row-${metric}`}
              className="border-t border-[var(--color-border-default)]"
            >
              <td className="py-1 text-[var(--color-text-primary)]">
                {qaMetricLabel(metric)}
              </td>
              <td className="py-1 text-right font-mono text-xs text-[var(--color-text-muted)]">
                {baseline !== null ? formatScore(baseline) : "-"}
              </td>
              <td className="py-1 text-right font-mono text-xs text-[var(--color-text-primary)]">
                {newVal !== null ? formatScore(newVal) : "-"}
              </td>
              <td
                data-testid={`score-diff-${metric}`}
                className={cn(
                  "py-1 text-right font-mono text-xs",
                  diff !== null && diff > 0 && "text-[var(--color-action-success)]",
                  diff !== null && diff < 0 && "text-[var(--color-action-danger)]",
                  (diff === null || diff === 0) && "text-[var(--color-text-muted)]",
                )}
              >
                {diff !== null ? formatDiff(diff) : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
