/**
 * Global and per-cell controls for the sync-play grid (PRD-036 Phase 3).
 *
 * Global: play/pause, seek, speed
 * Per-cell: mute/unmute, zoom, audio isolation
 */

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Pause, Play, Volume2, VolumeX, Maximize2, Minimize2 } from "@/tokens/icons";

import { SpeedControl } from "@/features/video-player/components/SpeedControl";
import { formatDuration } from "@/features/video-player";

import type { SyncPlayControls } from "./useSyncPlay";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GridControlsProps {
  sync: SyncPlayControls;
  cellCount: number;
  cellLabels: string[];
  /** Refs to each cell's video element, for per-cell mute/zoom. */
  cellVideoRefs: React.RefObject<HTMLVideoElement | null>[];
  className?: string;
}

interface CellAudioState {
  muted: boolean;
  zoom: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GridControls({
  sync,
  cellCount,
  cellLabels,
  cellVideoRefs,
  className,
}: GridControlsProps) {
  const [cellStates, setCellStates] = useState<CellAudioState[]>(() =>
    Array.from({ length: cellCount }, () => ({ muted: false, zoom: 1 })),
  );

  const trackRef = useRef<HTMLDivElement>(null);

  /* -- Global controls ------------------------------------------------------ */

  const handleTogglePlay = useCallback(() => {
    if (sync.isPlaying) {
      sync.syncPause();
    } else {
      sync.syncPlay();
    }
  }, [sync]);

  const handleSeek = useCallback(
    (e: React.PointerEvent) => {
      const track = trackRef.current;
      if (!track || sync.duration <= 0) return;

      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      sync.syncSeek(ratio * sync.duration);
    },
    [sync],
  );

  /* -- Per-cell controls ---------------------------------------------------- */

  const toggleCellMute = useCallback(
    (cellIndex: number) => {
      const video = cellVideoRefs[cellIndex]?.current;
      if (!video) return;

      video.muted = !video.muted;
      setCellStates((prev) => {
        const next = [...prev];
        if (next[cellIndex]) {
          next[cellIndex] = { ...next[cellIndex], muted: video.muted };
        }
        return next;
      });
    },
    [cellVideoRefs],
  );

  const muteAllExcept = useCallback(
    (cellIndex: number) => {
      setCellStates((prev) => {
        const next = prev.map((state, i) => {
          const video = cellVideoRefs[i]?.current;
          if (!video) return state;
          const shouldMute = i !== cellIndex;
          video.muted = shouldMute;
          return { ...state, muted: shouldMute };
        });
        return next;
      });
    },
    [cellVideoRefs],
  );

  const adjustZoom = useCallback(
    (cellIndex: number, direction: "in" | "out") => {
      setCellStates((prev) => {
        const next = [...prev];
        const current = next[cellIndex];
        if (!current) return prev;

        const newZoom =
          direction === "in"
            ? Math.min(ZOOM_MAX, current.zoom + ZOOM_STEP)
            : Math.max(ZOOM_MIN, current.zoom - ZOOM_STEP);

        next[cellIndex] = { ...current, zoom: newZoom };
        return next;
      });
    },
    [],
  );

  const progress = sync.duration > 0 ? (sync.currentTime / sync.duration) * 100 : 0;

  return (
    <div className={cn("flex flex-col gap-[var(--spacing-2)]", className)}>
      {/* Global transport bar */}
      <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-[var(--spacing-1)] bg-[var(--color-surface-primary)]/90 backdrop-blur-sm rounded-[var(--radius-md)]">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={handleTogglePlay}
          className="p-[var(--spacing-1)] text-[var(--color-text-primary)] hover:text-[var(--color-action-primary)] transition-colors"
          title={sync.isPlaying ? "Pause all" : "Play all"}
        >
          {sync.isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        {/* Timeline */}
        <div
          ref={trackRef}
          className="flex-1 relative h-5 cursor-pointer group select-none"
          onPointerDown={handleSeek}
        >
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-[var(--color-surface-tertiary)]">
            <div
              className="absolute top-0 bottom-0 left-0 bg-[var(--color-action-primary)] rounded-full transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full",
              "bg-[var(--color-action-primary)] shadow-sm",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Time display */}
        <span className="text-xs font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
          {formatDuration(sync.currentTime)} / {formatDuration(sync.duration)}
        </span>

        {/* Speed */}
        <SpeedControl speed={sync.speed} onSpeedChange={sync.syncSpeed} />
      </div>

      {/* Per-cell controls row */}
      {cellCount > 1 && (
        <div className="flex items-center gap-[var(--spacing-3)] px-[var(--spacing-2)]">
          {Array.from({ length: cellCount }, (_, i) => {
            const state = cellStates[i];
            const label = cellLabels[i] ?? `Cell ${i + 1}`;

            return (
              <div
                key={i}
                className="flex items-center gap-[var(--spacing-1)] text-xs"
              >
                <span className="text-[var(--color-text-muted)] font-medium">
                  {label}:
                </span>

                {/* Mute toggle */}
                <button
                  type="button"
                  onClick={() => toggleCellMute(i)}
                  className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title={state?.muted ? "Unmute" : "Mute"}
                >
                  {state?.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                {/* Solo (mute all except this) */}
                <button
                  type="button"
                  onClick={() => muteAllExcept(i)}
                  className="px-1 py-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-action-primary)] transition-colors rounded-[var(--radius-sm)]"
                  title="Solo (mute all others)"
                >
                  S
                </button>

                {/* Zoom in */}
                <button
                  type="button"
                  onClick={() => adjustZoom(i, "in")}
                  className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title={`Zoom in (${state?.zoom ?? 1}x)`}
                >
                  <Maximize2 size={14} />
                </button>

                {/* Zoom out */}
                <button
                  type="button"
                  onClick={() => adjustZoom(i, "out")}
                  className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title={`Zoom out (${state?.zoom ?? 1}x)`}
                >
                  <Minimize2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Returns the per-cell zoom levels for use by the SyncPlayGrid parent.
 * Exported so the grid can apply CSS transforms based on zoom state.
 */
export type { CellAudioState };
