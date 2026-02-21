import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { frameToSeconds } from "../frame-utils";

interface TimelineScrubberProps {
  currentTime: number;
  duration: number;
  /** In-point frame for A-B loop marker (null if not set). */
  inPoint: number | null;
  /** Out-point frame for A-B loop marker (null if not set). */
  outPoint: number | null;
  framerate: number;
  onSeek: (time: number) => void;
  className?: string;
}

export function TimelineScrubber({
  currentTime,
  duration,
  inPoint,
  outPoint,
  framerate,
  onSeek,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;

      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      seekFromPointer(e.clientX);
    },
    [seekFromPointer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      seekFromPointer(e.clientX);
    },
    [isDragging, seekFromPointer],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Convert A-B loop frame markers to percentage positions.
  const inPercent =
    inPoint !== null && framerate > 0 && duration > 0
      ? (frameToSeconds(inPoint, framerate) / duration) * 100
      : null;
  const outPercent =
    outPoint !== null && framerate > 0 && duration > 0
      ? (frameToSeconds(outPoint, framerate) / duration) * 100
      : null;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative w-full h-5 cursor-pointer group select-none",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Track background */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-[var(--color-surface-tertiary)]">
        {/* A-B loop range highlight */}
        {inPercent !== null && outPercent !== null && (
          <div
            className="absolute top-0 bottom-0 bg-[var(--color-status-warning)]/20 rounded-full"
            style={{ left: `${inPercent}%`, width: `${outPercent - inPercent}%` }}
          />
        )}

        {/* Progress fill */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-[var(--color-action-primary)] rounded-full transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* In-point marker */}
      {inPercent !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-status-warning)]"
          style={{ left: `${inPercent}%` }}
          title={`In-point: frame ${inPoint}`}
        />
      )}

      {/* Out-point marker */}
      {outPercent !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-status-warning)]"
          style={{ left: `${outPercent}%` }}
          title={`Out-point: frame ${outPoint}`}
        />
      )}

      {/* Playhead */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full",
          "bg-[var(--color-action-primary)] shadow-sm",
          "transition-transform duration-75",
          isDragging ? "scale-125" : "scale-100 group-hover:scale-110",
        )}
        style={{ left: `${progress}%` }}
      />
    </div>
  );
}
