import { useCallback, useRef, useState } from "react";

import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { frameToSeconds } from "../frame-utils";

/** A frame range annotation to render on the timeline. */
export interface TimelineAnnotationRange {
  start: number;
  end: number;
}

interface TimelineScrubberProps {
  currentTime: number;
  duration: number;
  /** In-point frame for A-B loop marker (null if not set). */
  inPoint: number | null;
  /** Out-point frame for A-B loop marker (null if not set). */
  outPoint: number | null;
  /** Annotation frame ranges to highlight on the timeline. */
  annotationRanges?: TimelineAnnotationRange[];
  framerate: number;
  onSeek: (time: number) => void;
  /** Whether annotation playback mode is actively slowing in a zone. */
  annotationModeActive?: boolean;
  /** Current frame number for determining which range is active. */
  currentFrame?: number;
  /** Called when an annotation range is clicked on the timeline. */
  onAnnotationRangeClick?: (range: TimelineAnnotationRange) => void;
  className?: string;
}

export function TimelineScrubber({
  currentTime,
  duration,
  inPoint,
  outPoint,
  annotationRanges,
  framerate,
  onSeek,
  annotationModeActive,
  currentFrame,
  onAnnotationRangeClick,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const annotationClickedRef = useRef(false);

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
      // Skip if an annotation range was just clicked
      if (annotationClickedRef.current) {
        annotationClickedRef.current = false;
        return;
      }
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

  const handleAnnotationClick = useCallback(
    (range: TimelineAnnotationRange) => {
      annotationClickedRef.current = true;
      onAnnotationRangeClick?.(range);
    },
    [onAnnotationRangeClick],
  );

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

        {/* Annotation range fills (visual only — clickable zones are separate) */}
        {annotationRanges?.map((range) => {
          if (framerate <= 0 || duration <= 0) return null;
          const startPct = (frameToSeconds(range.start, framerate) / duration) * 100;
          const endPct = (frameToSeconds(range.end, framerate) / duration) * 100;

          const isActive =
            annotationModeActive &&
            currentFrame !== undefined &&
            currentFrame >= range.start &&
            currentFrame <= range.end;

          return (
            <div
              key={`fill-${range.start}-${range.end}`}
              className={cn(
                "absolute top-0 bottom-0 rounded-full pointer-events-none",
                isActive
                  ? "bg-amber-500/20 animate-[annotation-pulse_1.5s_ease-in-out_infinite]"
                  : "bg-amber-500/20",
              )}
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />
          );
        })}

        {/* Progress fill */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-[var(--color-action-primary)] rounded-full"
          style={{ width: `${progress}%` }}
        />

        {/* Annotation edge markers (above progress so always visible) */}
        {annotationRanges?.map((range) => {
          if (framerate <= 0 || duration <= 0) return null;
          const startPct = (frameToSeconds(range.start, framerate) / duration) * 100;
          const endPct = (frameToSeconds(range.end, framerate) / duration) * 100;
          return (
            <div key={`markers-${range.start}-${range.end}`}>
              <Tooltip content={`Annotation start: F${range.start}`}>
                <div
                  className="absolute w-px bg-amber-500/70"
                  style={{ left: `${startPct}%`, top: "-2px", bottom: "-2px" }}
                />
              </Tooltip>
              <Tooltip content={`Annotation end: F${range.end}`}>
                <div
                  className="absolute w-px bg-amber-500/70"
                  style={{ left: `${endPct}%`, top: "-2px", bottom: "-2px" }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>

      {/* Clickable annotation zones — full height for easy clicking */}
      {onAnnotationRangeClick && annotationRanges?.map((range) => {
        if (framerate <= 0 || duration <= 0) return null;
        const startPct = (frameToSeconds(range.start, framerate) / duration) * 100;
        const endPct = (frameToSeconds(range.end, framerate) / duration) * 100;

        const isLooped = inPoint === range.start && outPoint === range.end;

        return (
          <Tooltip key={`click-${range.start}-${range.end}`} content={`F${range.start}–F${range.end} (click to loop)`}>
            <div
              className={cn(
                "absolute top-0 bottom-0 z-10 cursor-pointer",
                "hover:bg-amber-500/15 transition-colors",
                isLooped && "bg-amber-500/10 border-y border-amber-500/30",
              )}
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleAnnotationClick(range);
              }}
            />
          </Tooltip>
        );
      })}

      {/* In-point marker */}
      {inPercent !== null && (
        <Tooltip content={`In-point: frame ${inPoint}`}>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-status-warning)] pointer-events-none"
            style={{ left: `${inPercent}%` }}
          />
        </Tooltip>
      )}

      {/* Out-point marker */}
      {outPercent !== null && (
        <Tooltip content={`Out-point: frame ${outPoint}`}>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-status-warning)] pointer-events-none"
            style={{ left: `${outPercent}%` }}
          />
        </Tooltip>
      )}

      {/* Playhead */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none",
          "bg-[var(--color-action-primary)] shadow-sm",
          "transition-transform duration-75",
          isDragging ? "scale-125" : "scale-100 group-hover:scale-110",
        )}
        style={{ left: `${progress}%` }}
      />
    </div>
  );
}
