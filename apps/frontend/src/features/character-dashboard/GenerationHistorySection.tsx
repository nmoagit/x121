/**
 * Generation history summary section (PRD-108).
 *
 * Displays summary statistics for segment generation: total, approved,
 * rejected, and pending counts with visual indicators.
 */

import { Badge } from "@/components";

import type { GenerationSummary } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GenerationHistorySectionProps {
  /** Generation summary statistics. */
  summary: GenerationSummary;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerationHistorySection({
  summary,
}: GenerationHistorySectionProps) {
  const stats = [
    {
      label: "Total",
      value: summary.total_segments,
      variant: "default" as const,
      testId: "gen-total",
    },
    {
      label: "Approved",
      value: summary.approved,
      variant: "success" as const,
      testId: "gen-approved",
    },
    {
      label: "Rejected",
      value: summary.rejected,
      variant: "danger" as const,
      testId: "gen-rejected",
    },
    {
      label: "Pending",
      value: summary.pending,
      variant: "warning" as const,
      testId: "gen-pending",
    },
  ];

  return (
    <div
      data-testid="generation-history-section"
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Generation History
      </h3>

      <div className="flex flex-wrap gap-3">
        {stats.map((stat) => (
          <div
            key={stat.testId}
            data-testid={stat.testId}
            className="flex items-center gap-1"
          >
            <Badge variant={stat.variant} size="sm">
              {stat.value}
            </Badge>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {summary.total_segments > 0 && (
        <div
          data-testid="gen-progress-bar"
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]"
        >
          <div className="flex h-full">
            {summary.approved > 0 && (
              <div
                data-testid="gen-bar-approved"
                className="bg-[var(--color-success)]"
                style={{
                  width: `${(summary.approved / summary.total_segments) * 100}%`,
                }}
              />
            )}
            {summary.pending > 0 && (
              <div
                data-testid="gen-bar-pending"
                className="bg-[var(--color-warning)]"
                style={{
                  width: `${(summary.pending / summary.total_segments) * 100}%`,
                }}
              />
            )}
            {summary.rejected > 0 && (
              <div
                data-testid="gen-bar-rejected"
                className="bg-[var(--color-danger)]"
                style={{
                  width: `${(summary.rejected / summary.total_segments) * 100}%`,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
