/**
 * Production run progress dashboard component (PRD-57).
 *
 * Displays aggregate statistics: total cells, completed, failed, in-progress,
 * and a visual progress bar with completion percentage.
 */

import { Badge } from "@/components";

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

  return (
    <div data-testid="production-progress" className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total" value={total_cells} variant="default" />
        <StatCard
          label="Completed"
          value={completed_cells}
          variant="success"
        />
        <StatCard label="Failed" value={failed_cells} variant="danger" />
        <StatCard
          label="In Progress"
          value={in_progress_cells}
          variant="info"
        />
        <StatCard
          label="Not Started"
          value={not_started_cells}
          variant="default"
        />
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">
            Overall Progress
          </span>
          <span className="font-medium text-[var(--color-text-primary)]">
            {completion_pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
          <div
            data-testid="progress-bar-fill"
            className="h-full rounded-full bg-green-600 transition-all duration-500"
            style={{ width: `${Math.min(completion_pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Estimated time */}
      {in_progress_cells > 0 && completed_cells > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Estimated remaining:{" "}
          {estimateRemaining(total_cells, completed_cells, in_progress_cells)}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal components
   -------------------------------------------------------------------------- */

interface StatCardProps {
  label: string;
  value: number;
  variant: "default" | "success" | "danger" | "info";
}

function StatCard({ label, value, variant }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-center">
      <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
      <Badge variant={variant}>{label}</Badge>
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
