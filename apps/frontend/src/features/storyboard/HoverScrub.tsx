/**
 * Hover-scrub keyframe preview component (PRD-62).
 *
 * When the user moves their mouse over the component, it scrubs through
 * keyframes based on horizontal position, showing the active frame
 * enlarged with a timecode overlay.
 */

import { useCallback, useRef, useState } from "react";

import type { Keyframe } from "./types";
import { formatTimecode } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface HoverScrubProps {
  /** Keyframes to scrub through (should be ordered by frame_number). */
  keyframes: Keyframe[];
  /** Callback fired when the user clicks on a frame. */
  onFrameSelect?: (keyframe: Keyframe) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HoverScrub({ keyframes, onFrameSelect }: HoverScrubProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (keyframes.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const idx = Math.min(
        Math.floor(pct * keyframes.length),
        keyframes.length - 1,
      );
      setActiveIndex(idx);
    },
    [keyframes.length],
  );

  const handleClick = useCallback(() => {
    if (keyframes.length === 0) return;
    const kf = keyframes[activeIndex];
    if (kf) onFrameSelect?.(kf);
  }, [keyframes, activeIndex, onFrameSelect]);

  if (keyframes.length === 0) {
    return (
      <div
        data-testid="hover-scrub"
        className="flex h-48 items-center justify-center rounded border border-dashed border-[var(--color-border-subtle)] text-sm text-[var(--color-text-muted)]"
      >
        No keyframes available
      </div>
    );
  }

  // Safe to assert: we returned early above when length === 0, and
  // activeIndex is clamped to [0, length - 1].
  const active = keyframes[activeIndex] as Keyframe;

  return (
    <div
      ref={containerRef}
      data-testid="hover-scrub"
      className="relative cursor-crosshair overflow-hidden rounded border border-[var(--color-border-subtle)]"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {/* Active frame image */}
      <img
        data-testid="scrub-image"
        src={active.full_res_path ?? active.thumbnail_path}
        alt={`Frame ${active.frame_number}`}
        className="w-full object-contain transition-opacity duration-100"
      />

      {/* Timecode overlay */}
      <div
        data-testid="scrub-timecode"
        className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white"
      >
        #{active.frame_number} &middot; {formatTimecode(active.timestamp_secs)}
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-[var(--color-surface-tertiary)]">
        <div
          className="h-full bg-[var(--color-border-accent)] transition-all duration-75"
          style={{
            width: `${((activeIndex + 1) / keyframes.length) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
