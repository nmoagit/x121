/**
 * Frame-accurate timeline with draggable in/out trim handles (PRD-78).
 *
 * Renders a horizontal bar representing a segment's frame range. Users can
 * drag handles to set trim in/out points. Arrow keys provide frame-accurate
 * stepping.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { frameToTimecode } from "@/features/video-player/frame-utils";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TrimTimelineProps {
  /** Segment ID for test identification. */
  segmentId: number;
  /** Total number of frames in the original segment. */
  totalFrames: number;
  /** Segment framerate in fps, used for timecode display. */
  framerate: number;
  /** Current in-frame position. */
  inFrame?: number;
  /** Current out-frame position. */
  outFrame?: number;
  /** Callback fired when trim points change. */
  onTrimChange: (inFrame: number, outFrame: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Clamp a value to a range. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TrimTimeline({
  segmentId,
  totalFrames,
  framerate,
  inFrame: initialInFrame = 0,
  outFrame: initialOutFrame,
  onTrimChange,
}: TrimTimelineProps) {
  const defaultOut = initialOutFrame ?? totalFrames;
  const [inFrame, setInFrame] = useState(initialInFrame);
  const [outFrame, setOutFrame] = useState(defaultOut);
  const [activeHandle, setActiveHandle] = useState<"in" | "out" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Sync with external prop changes.
  useEffect(() => {
    setInFrame(initialInFrame);
  }, [initialInFrame]);

  useEffect(() => {
    setOutFrame(initialOutFrame ?? totalFrames);
  }, [initialOutFrame, totalFrames]);

  const frameToPercent = useCallback(
    (frame: number) => (totalFrames > 0 ? (frame / totalFrames) * 100 : 0),
    [totalFrames],
  );

  const percentToFrame = useCallback(
    (pct: number) => Math.round((pct / 100) * totalFrames),
    [totalFrames],
  );

  const handlePointerDown = useCallback(
    (handle: "in" | "out") => (e: React.PointerEvent) => {
      e.preventDefault();
      setActiveHandle(handle);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!activeHandle || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const frame = percentToFrame(pct);

      if (activeHandle === "in") {
        const clamped = clamp(frame, 0, outFrame - 1);
        setInFrame(clamped);
        onTrimChange(clamped, outFrame);
      } else {
        const clamped = clamp(frame, inFrame + 1, totalFrames);
        setOutFrame(clamped);
        onTrimChange(inFrame, clamped);
      }
    },
    [activeHandle, inFrame, outFrame, totalFrames, percentToFrame, onTrimChange],
  );

  const handlePointerUp = useCallback(() => {
    setActiveHandle(null);
  }, []);

  // Arrow key support for frame-accurate stepping.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeHandle === "out") {
          const next = clamp(outFrame - step, inFrame + 1, totalFrames);
          setOutFrame(next);
          onTrimChange(inFrame, next);
        } else {
          const next = clamp(inFrame - step, 0, outFrame - 1);
          setInFrame(next);
          onTrimChange(next, outFrame);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeHandle === "out") {
          const next = clamp(outFrame + step, inFrame + 1, totalFrames);
          setOutFrame(next);
          onTrimChange(inFrame, next);
        } else {
          const next = clamp(inFrame + step, 0, outFrame - 1);
          setInFrame(next);
          onTrimChange(next, outFrame);
        }
      }
    },
    [activeHandle, inFrame, outFrame, totalFrames, onTrimChange],
  );

  const inPercent = frameToPercent(inFrame);
  const outPercent = frameToPercent(outFrame);

  return (
    <div
      data-testid={`trim-timeline-${segmentId}`}
      className="space-y-2"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label="Trim timeline"
      aria-valuemin={0}
      aria-valuemax={totalFrames}
    >
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-8 w-full cursor-pointer rounded bg-[var(--color-surface-secondary)]"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Excluded region (before in-point) */}
        <div
          data-testid="excluded-before"
          className="absolute inset-y-0 left-0 rounded-l bg-[var(--color-surface-tertiary)] opacity-50"
          style={{ width: `${inPercent}%` }}
        />

        {/* Kept region (between in and out) */}
        <div
          data-testid="kept-region"
          className="absolute inset-y-0 rounded bg-blue-500/30"
          style={{
            left: `${inPercent}%`,
            width: `${outPercent - inPercent}%`,
          }}
        />

        {/* Excluded region (after out-point) */}
        <div
          data-testid="excluded-after"
          className="absolute inset-y-0 right-0 rounded-r bg-[var(--color-surface-tertiary)] opacity-50"
          style={{ width: `${100 - outPercent}%` }}
        />

        {/* In handle */}
        <div
          data-testid="in-handle"
          className="absolute top-0 h-full w-1.5 cursor-ew-resize rounded bg-green-500"
          style={{ left: `${inPercent}%`, transform: "translateX(-50%)" }}
          onPointerDown={handlePointerDown("in")}
        />

        {/* Out handle */}
        <div
          data-testid="out-handle"
          className="absolute top-0 h-full w-1.5 cursor-ew-resize rounded bg-red-500"
          style={{ left: `${outPercent}%`, transform: "translateX(-50%)" }}
          onPointerDown={handlePointerDown("out")}
        />
      </div>

      {/* Timecodes */}
      <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
        <span data-testid="in-timecode">
          In: {frameToTimecode(inFrame, framerate)} (frame {inFrame})
        </span>
        <span data-testid="frame-count">
          {outFrame - inFrame} / {totalFrames} frames
        </span>
        <span data-testid="out-timecode">
          Out: {frameToTimecode(outFrame, framerate)} (frame {outFrame})
        </span>
      </div>
    </div>
  );
}
