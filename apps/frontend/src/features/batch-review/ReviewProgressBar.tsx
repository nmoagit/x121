/**
 * Review session progress display (PRD-92).
 *
 * Shows an overall progress bar with breakdown of approved/rejected/pending
 * counts, plus average review pace and estimated remaining time.
 */

import { Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

import { useReviewProgress } from "./hooks/use-batch-review";
import { formatEstimatedTime, formatPace } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ReviewProgressBarProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReviewProgressBar({ projectId }: ReviewProgressBarProps) {
  const { data: progress, isPending, isError } = useReviewProgress(projectId);

  if (isPending) {
    return (
      <div data-testid="review-progress-loading" className="flex items-center gap-2 py-2">
        <Spinner size="sm" />
        <span className="text-sm text-[var(--color-text-muted)]">Loading progress...</span>
      </div>
    );
  }

  if (isError || !progress) {
    return (
      <div className="text-sm text-[var(--color-status-error)] py-2">
        Failed to load review progress
      </div>
    );
  }

  const { total_segments, reviewed_segments, approved_segments, rejected_segments, pending_segments } = progress;

  const reviewedPercent = total_segments > 0 ? reviewed_segments / total_segments : 0;
  const approvedPercent = total_segments > 0 ? approved_segments / total_segments : 0;
  const rejectedPercent = total_segments > 0 ? rejected_segments / total_segments : 0;

  return (
    <div data-testid="review-progress-bar" className="flex flex-col gap-2">
      {/* Header: count and percentage */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {reviewed_segments} of {total_segments} reviewed ({formatPercent(reviewedPercent, 0)})
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {formatEstimatedTime(progress.estimated_remaining_seconds)}
        </span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
        <div className="flex h-full">
          {approvedPercent > 0 && (
            <div
              className="h-full bg-[var(--color-action-success)] transition-all"
              style={{ width: `${approvedPercent * 100}%` }}
            />
          )}
          {rejectedPercent > 0 && (
            <div
              className="h-full bg-[var(--color-action-danger)] transition-all"
              style={{ width: `${rejectedPercent * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Breakdown row */}
      <div className="flex items-center gap-4 text-xs">
        <StatusDot color="var(--color-action-success)" label="Approved" count={approved_segments} />
        <StatusDot color="var(--color-action-danger)" label="Rejected" count={rejected_segments} />
        <StatusDot color="var(--color-text-muted)" label="Pending" count={pending_segments} />
        <span className={cn("ml-auto text-[var(--color-text-muted)]")}>
          Pace: {formatPace(progress.avg_pace_seconds)}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal sub-component
   -------------------------------------------------------------------------- */

function StatusDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="flex items-center gap-1 text-[var(--color-text-secondary)]">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}: {count}
    </span>
  );
}
