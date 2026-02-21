/**
 * Review queue display component (PRD-35).
 *
 * Shows a list of segments to review with progress tracking and the ability
 * to jump to any specific segment.
 */

import { useReviewQueue } from "./hooks/use-review";
import type { ReviewQueueItem } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReviewQueueProps {
  /** The scene whose segments are being reviewed. */
  sceneId: number;
  /** The currently active segment ID. */
  activeSegmentId: number | null;
  /** Called when the user clicks a segment to jump to it. */
  onSelectSegment: (segmentId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReviewQueue({
  sceneId,
  activeSegmentId,
  onSelectSegment,
}: ReviewQueueProps) {
  const { data: queue, isPending, isError } = useReviewQueue(sceneId);

  if (isPending) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        Loading review queue...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-[var(--color-status-error)]">
        Failed to load review queue
      </div>
    );
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        No segments to review
      </div>
    );
  }

  const reviewedCount = queue.filter((item) => item.has_approval).length;
  const totalCount = queue.length;

  return (
    <div className="flex flex-col gap-3" data-testid="review-queue">
      {/* Progress counter */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Review Queue
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          {reviewedCount} of {totalCount} reviewed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{
            width: `${totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Segment list */}
      <ul className="flex flex-col gap-1">
        {queue.map((item: ReviewQueueItem) => {
          const isActive = item.segment_id === activeSegmentId;
          return (
            <li key={item.segment_id}>
              <button
                type="button"
                onClick={() => onSelectSegment(item.segment_id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--color-action-primary)] text-white"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
                }`}
                aria-current={isActive ? "true" : undefined}
              >
                <span>Segment {item.sequence_index + 1}</span>
                <span
                  className={`text-xs ${
                    item.has_approval
                      ? "text-green-400"
                      : isActive
                        ? "text-white/70"
                        : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {item.has_approval ? "Reviewed" : "Pending"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* End of queue message */}
      {reviewedCount === totalCount && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-center text-sm text-green-400">
          All segments reviewed
        </div>
      )}
    </div>
  );
}
