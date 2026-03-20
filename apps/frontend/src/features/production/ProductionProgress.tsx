/**
 * Production run progress dashboard component (PRD-57).
 *
 * Displays aggregate statistics: total cells, completed, failed, in-progress,
 * and a visual progress bar with completion percentage.
 */

import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";

import type { ProductionRunProgress } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ProductionProgressProps {
  /** Aggregate progress data from the server. */
  progress: ProductionRunProgress;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProductionProgress({ progress }: ProductionProgressProps) {
  const {
    total_cells,
    completed_cells,
    failed_cells,
    in_progress_cells,
    not_started_cells,
    completion_pct,
  } = progress;

  const stats = [
    { label: "Total", value: total_cells, color: "text-cyan-400" },
    { label: "Done", value: completed_cells, color: "text-green-400" },
    { label: "Failed", value: failed_cells, color: failed_cells > 0 ? "text-red-400" : "text-[var(--color-text-muted)]" },
    { label: "Active", value: in_progress_cells, color: in_progress_cells > 0 ? "text-cyan-400" : "text-[var(--color-text-muted)]" },
    { label: "Waiting", value: not_started_cells, color: "text-[var(--color-text-muted)]" },
  ];

  return (
    <div data-testid="production-progress" className="space-y-3">
      {/* Stats ticker strip */}
      <div className="flex items-center gap-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs overflow-x-auto">
        {stats.map((stat, idx) => (
          <span key={stat.label} className="flex items-center whitespace-nowrap">
            {idx > 0 && (
              <span className={`mx-3 ${TERMINAL_PIPE} select-none`}>|</span>
            )}
            <span className="uppercase tracking-wide text-[var(--color-text-muted)]">
              {stat.label}:
            </span>
            <span className={`ml-1 ${stat.color}`}>{stat.value}</span>
          </span>
        ))}
      </div>

      {/* Progress bar panel */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <div className="flex items-center justify-between">
            <span className={TERMINAL_HEADER_TITLE}>Overall Progress</span>
            <span className="font-mono text-xs text-green-400">
              {completion_pct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className={TERMINAL_BODY}>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
            <div
              data-testid="progress-bar-fill"
              className="h-full rounded-full bg-green-600 transition-all duration-500"
              style={{ width: `${Math.min(completion_pct, 100)}%` }}
            />
          </div>
          {/* Estimated time */}
          {in_progress_cells > 0 && completed_cells > 0 && (
            <p className="mt-2 text-[10px] font-mono text-[var(--color-text-muted)]">
              ETA: {estimateRemaining(total_cells, completed_cells, in_progress_cells)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Rough estimate of remaining time based on completion rate.
 * Assumes average time per cell is constant.
 */
function estimateRemaining(
  total: number,
  completed: number,
  _inProgress: number,
): string {
  const remaining = total - completed;
  if (remaining <= 0) return "Done";
  if (completed === 0) return "Calculating...";

  // Assume each in-progress cell takes ~2 minutes (placeholder average)
  const avgMinutesPerCell = 2;
  const estimatedMinutes = remaining * avgMinutesPerCell;

  if (estimatedMinutes < 60) {
    return `~${Math.ceil(estimatedMinutes)} min`;
  }
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = Math.ceil(estimatedMinutes % 60);
  return `~${hours}h ${minutes}m`;
}
