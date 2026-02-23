/**
 * Readiness summary bar component (PRD-107).
 *
 * Displays a summary of readiness states: X ready, Y partial, Z not started,
 * with a visual progress bar.
 */

import { Badge } from "@/components";

import type { ReadinessSummary } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReadinessSummaryBarProps {
  /** Readiness summary data from the API. */
  summary: ReadinessSummary;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReadinessSummaryBar({ summary }: ReadinessSummaryBarProps) {
  const { total, ready, partially_ready, not_started } = summary;

  const readyPct = total > 0 ? Math.round((ready / total) * 100) : 0;
  const partialPct = total > 0 ? Math.round((partially_ready / total) * 100) : 0;
  const notStartedPct = total > 0 ? Math.round((not_started / total) * 100) : 0;

  return (
    <div data-testid="readiness-summary-bar" className="space-y-2">
      {/* Badge summary */}
      <div className="flex items-center gap-3 text-sm">
        <span data-testid="summary-ready">
          <Badge variant="success" size="sm">
            {ready} ready
          </Badge>
        </span>
        <span data-testid="summary-partial">
          <Badge variant="warning" size="sm">
            {partially_ready} partial
          </Badge>
        </span>
        <span data-testid="summary-not-started">
          <Badge variant="danger" size="sm">
            {not_started} not started
          </Badge>
        </span>
        <span
          data-testid="summary-total"
          className="text-xs text-[var(--color-text-muted)]"
        >
          {total} total
        </span>
      </div>

      {/* Progress bar */}
      <div
        data-testid="progress-bar"
        className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]"
      >
        {readyPct > 0 && (
          <div
            data-testid="progress-ready"
            className="bg-[var(--color-action-success)]"
            style={{ width: `${readyPct}%` }}
          />
        )}
        {partialPct > 0 && (
          <div
            data-testid="progress-partial"
            className="bg-[var(--color-action-warning)]"
            style={{ width: `${partialPct}%` }}
          />
        )}
        {notStartedPct > 0 && (
          <div
            data-testid="progress-not-started"
            className="bg-[var(--color-action-danger)]"
            style={{ width: `${notStartedPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
