/**
 * Visual progress bar for the generation loop (PRD-24).
 *
 * Displays a strip of segment blocks coloured by status, a duration counter,
 * a percentage indicator, and an ETA.
 */

import { formatDuration } from "@/lib/format";

import type { GenerationProgress, SegmentStatus } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Tailwind class per segment status. */
const STATUS_COLOR: Record<SegmentStatus, string> = {
  pending: "bg-[var(--color-bg-muted)]",
  generating: "bg-[var(--color-info)]",
  completed: "bg-[var(--color-success)]",
  failed: "bg-[var(--color-danger)]",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GenerationProgressBarProps {
  progress: GenerationProgress;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Convert seconds to ms and format via the shared `formatDuration` utility. */
function formatSecs(secs: number): string {
  return formatDuration(secs * 1000);
}

function segmentStatus(index: number, completed: number): SegmentStatus {
  if (index < completed) return "completed";
  if (index === completed) return "generating";
  return "pending";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerationProgressBar({
  progress,
}: GenerationProgressBarProps) {
  const {
    segments_completed,
    segments_estimated,
    cumulative_duration,
    target_duration,
    estimated_remaining_secs,
  } = progress;

  const total = segments_estimated ?? 1;
  const percent =
    total > 0 ? Math.min(100, Math.round((segments_completed / total) * 100)) : 0;
  const isComplete = segments_completed >= total && total > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Segment strip */}
      <div
        className="flex gap-0.5 h-3 rounded overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Generation progress"
      >
        {Array.from({ length: total }, (_, i) => {
          const status = segmentStatus(i, segments_completed);
          return (
            <div
              key={i}
              className={`flex-1 ${STATUS_COLOR[status]} transition-colors`}
              data-testid={`segment-block-${i}`}
              data-status={status}
            />
          );
        })}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
        {/* Duration counter */}
        <span data-testid="duration-counter">
          {formatSecs(cumulative_duration)}
          {target_duration != null && ` / ${formatSecs(target_duration)} target`}
        </span>

        {/* Percentage */}
        <span data-testid="percent-indicator">
          {isComplete ? "Complete" : `${percent}%`}
        </span>

        {/* ETA */}
        {estimated_remaining_secs != null && !isComplete && (
          <span data-testid="eta-display">
            ~{formatSecs(estimated_remaining_secs)} remaining
          </span>
        )}
      </div>
    </div>
  );
}
