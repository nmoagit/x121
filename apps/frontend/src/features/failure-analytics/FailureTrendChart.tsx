/**
 * Failure trend chart component (PRD-64).
 *
 * Renders a line chart showing failure rates over time with sample counts.
 * Uses a simple SVG-based visualization since the project does not include
 * a charting library.
 */

import { useState } from "react";

import { useFailureTrends } from "./hooks/use-failure-analytics";
import { TREND_PERIODS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FailureTrendChartProps {
  /** The pattern ID to show trends for. */
  patternId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FailureTrendChart({ patternId }: FailureTrendChartProps) {
  const [periodDays, setPeriodDays] = useState(30);

  const { data, isPending, isError } = useFailureTrends(
    patternId,
    periodDays,
  );

  return (
    <div className="space-y-4" data-testid="trend-chart">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--color-text-secondary)]">
          Period:
        </span>
        <div className="flex gap-1">
          {TREND_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`rounded px-3 py-1 text-xs transition-colors ${
                periodDays === p.value
                  ? "bg-[var(--color-action-primary)] text-white"
                  : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
              }`}
              onClick={() => setPeriodDays(p.value)}
              data-testid={`period-${p.value}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading/error states */}
      {isPending && (
        <p className="text-sm text-[var(--color-text-muted)]">
          Loading trend data...
        </p>
      )}
      {isError && (
        <p className="text-sm text-[var(--color-action-danger)]">
          Failed to load trend data.
        </p>
      )}

      {/* Trend data points */}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {/* Simple bar-style visualization */}
          {data.map((point) => (
            <div
              key={point.period}
              className="flex items-center gap-3"
              data-testid="trend-point"
            >
              <span className="w-24 text-xs text-[var(--color-text-secondary)]">
                {point.period}
              </span>
              <div className="flex-1">
                <div className="h-4 w-full rounded bg-[var(--color-surface-tertiary)]">
                  <div
                    className="h-4 rounded bg-[var(--color-action-primary)]"
                    style={{ width: `${Math.max(point.failure_rate * 100, 2)}%` }}
                  />
                </div>
              </div>
              <span className="w-12 text-right font-mono text-xs text-[var(--color-text-primary)]">
                {(point.failure_rate * 100).toFixed(1)}%
              </span>
              <span className="w-20 text-right text-xs text-[var(--color-text-muted)]">
                {point.sample_count} samples
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && data.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No trend data available for this pattern.
        </p>
      )}
    </div>
  );
}
