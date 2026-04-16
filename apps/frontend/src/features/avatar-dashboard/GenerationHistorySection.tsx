/**
 * Generation history summary section (PRD-108).
 *
 * Displays summary statistics for segment generation: total, approved,
 * rejected, and pending counts with visual indicators.
 */

import type { GenerationSummary } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GenerationHistorySectionProps {
  summary: GenerationSummary;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerationHistorySection({
  summary,
}: GenerationHistorySectionProps) {
  const stats = [
    { label: "total", value: summary.total_segments, color: "text-[var(--color-text-muted)]", testId: "gen-total" },
    { label: "approved", value: summary.approved, color: "text-[var(--color-data-green)]", testId: "gen-approved" },
    { label: "rejected", value: summary.rejected, color: "text-[var(--color-data-red)]", testId: "gen-rejected" },
    { label: "pending", value: summary.pending, color: "text-[var(--color-data-orange)]", testId: "gen-pending" },
  ];

  return (
    <div data-testid="generation-history-section" className="flex flex-col gap-2">
      <div className={`flex items-center gap-0 ${TYPO_DATA}`}>
        {stats.map((stat, idx) => (
          <span key={stat.testId} data-testid={stat.testId} className="flex items-center">
            {idx > 0 && <span className="mx-2 text-[var(--color-text-muted)] opacity-30">|</span>}
            <span className="uppercase tracking-wide text-[var(--color-text-muted)]">{stat.label}:</span>
            <span className={`ml-1 font-semibold ${stat.color}`}>{stat.value}</span>
          </span>
        ))}
      </div>

      {summary.total_segments > 0 && (
        <div data-testid="gen-progress-bar" className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="flex h-full">
            {summary.approved > 0 && (
              <div data-testid="gen-bar-approved" className="bg-green-400" style={{ width: `${(summary.approved / summary.total_segments) * 100}%` }} />
            )}
            {summary.pending > 0 && (
              <div data-testid="gen-bar-pending" className="bg-orange-400" style={{ width: `${(summary.pending / summary.total_segments) * 100}%` }} />
            )}
            {summary.rejected > 0 && (
              <div data-testid="gen-bar-rejected" className="bg-red-400" style={{ width: `${(summary.rejected / summary.total_segments) * 100}%` }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
