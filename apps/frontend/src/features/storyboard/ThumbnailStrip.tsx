/**
 * Filmstrip thumbnail strip component (PRD-62).
 *
 * Renders a horizontal scrollable row of keyframe thumbnails for a segment,
 * showing frame number and timecode below each thumbnail.
 */

import type { Keyframe } from "./types";
import { formatTimecode } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ThumbnailStripProps {
  /** Segment ID these keyframes belong to. */
  segmentId: number;
  /** Keyframes to display in the filmstrip. */
  keyframes: Keyframe[];
  /** Whether keyframe data is still loading. */
  isLoading?: boolean;
  /** Callback when a thumbnail is clicked. */
  onSelect?: (keyframe: Keyframe) => void;
}

/* --------------------------------------------------------------------------
   Skeleton
   -------------------------------------------------------------------------- */

const SKELETON_COUNT = 6;

function ThumbnailSkeleton() {
  return (
    <div className="flex-shrink-0 animate-pulse" data-testid="thumbnail-skeleton">
      <div className="h-[100px] w-[160px] rounded bg-[var(--color-surface-tertiary)]" />
      <div className="mt-1 h-3 w-20 rounded bg-[var(--color-surface-tertiary)]" />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ThumbnailStrip({
  segmentId,
  keyframes,
  isLoading = false,
  onSelect,
}: ThumbnailStripProps) {
  if (isLoading) {
    return (
      <div
        data-testid={`thumbnail-strip-${segmentId}`}
        className="flex gap-2 overflow-x-auto py-2"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <ThumbnailSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (keyframes.length === 0) {
    return (
      <div
        data-testid={`thumbnail-strip-${segmentId}`}
        className="py-4 text-center text-sm text-[var(--color-text-muted)]"
      >
        <p data-testid="empty-strip">No keyframes extracted yet.</p>
      </div>
    );
  }

  return (
    <div
      data-testid={`thumbnail-strip-${segmentId}`}
      className="flex gap-2 overflow-x-auto py-2"
    >
      {keyframes.map((kf) => (
        <button
          key={kf.id}
          type="button"
          data-testid={`thumbnail-${kf.id}`}
          onClick={() => onSelect?.(kf)}
          className="flex-shrink-0 cursor-pointer rounded border border-transparent hover:border-[var(--color-border-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-accent)]"
        >
          <img
            src={kf.thumbnail_path}
            alt={`Frame ${kf.frame_number}`}
            className="h-[100px] w-auto rounded object-cover"
          />
          <p
            data-testid={`frame-info-${kf.id}`}
            className="mt-1 text-center text-xs text-[var(--color-text-muted)]"
          >
            #{kf.frame_number} {formatTimecode(kf.timestamp_secs)}
          </p>
        </button>
      ))}
    </div>
  );
}
