import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight, Pause, Play, Repeat, RotateCcw, ScanEye, SkipBack } from "@/tokens/icons";

import type { ABLoopControls } from "../hooks/use-ab-loop";
import type { AnnotationPlaybackControls } from "../hooks/use-annotation-playback";
import type { VideoPlayerControls } from "../hooks/use-video-player";
import type { PlaybackQuality } from "../types";
import { QualitySelector } from "./QualitySelector";
import { SpeedControl } from "./SpeedControl";
import { VolumeControl } from "./VolumeControl";

const ANNOTATION_SLOW_PRESETS = [0.1, 0.25, 0.5] as const;

interface TransportControlsProps {
  player: VideoPlayerControls;
  loop: ABLoopControls;
  quality: PlaybackQuality;
  onQualityChange: (quality: PlaybackQuality) => void;
  /** Annotation playback controls. Null when no annotation ranges exist. */
  annotationPlayback: AnnotationPlaybackControls | null;
  /** Whether whole-video looping is enabled. */
  looping?: boolean;
  /** Toggle whole-video loop on/off. */
  onLoopToggle?: () => void;
  className?: string;
}

export function TransportControls({
  player,
  loop,
  quality,
  onQualityChange,
  annotationPlayback,
  looping,
  onLoopToggle,
  className,
}: TransportControlsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-[var(--spacing-1)]",
        className,
      )}
    >
      {/* Replay from start */}
      <button
        type="button"
        onClick={() => { player.seekToTime(0); player.play(); }}
        className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        title="Replay from start"
      >
        <SkipBack size={14} />
      </button>

      {/* Step backward */}
      <button
        type="button"
        onClick={player.stepBackward}
        className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        title="Step backward (frame)"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={player.togglePlay}
        className="p-[var(--spacing-1)] text-[var(--color-text-primary)] hover:text-[var(--color-action-primary)] transition-colors"
        title={player.isPlaying ? "Pause" : "Play"}
      >
        {player.isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>

      {/* Step forward */}
      <button
        type="button"
        onClick={player.stepForward}
        className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        title="Step forward (frame)"
      >
        <ChevronRight size={16} />
      </button>

      {/* Back 5 seconds */}
      <button
        type="button"
        onClick={() => player.seekToTime(Math.max(0, player.currentTime - 5))}
        className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        title="Back 5 seconds"
      >
        <RotateCcw size={14} />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

      {/* Speed presets */}
      <SpeedControl speed={player.speed} onSpeedChange={player.setSpeed} />

      {/* Annotation playback mode */}
      {annotationPlayback && (
        <>
          {/* Separator */}
          <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

          {/* Toggle */}
          <button
            type="button"
            onClick={annotationPlayback.toggle}
            className={cn(
              "p-[var(--spacing-1)] rounded-[var(--radius-sm)] transition-colors",
              annotationPlayback.isEnabled
                ? "bg-amber-500 text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
            title="Annotation playback mode"
          >
            <ScanEye size={14} />
          </button>

          {/* Slow-speed presets — only visible when annotation mode is active */}
          {annotationPlayback.isEnabled && (
            <div className="flex items-center gap-0.5">
              {ANNOTATION_SLOW_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => annotationPlayback.setSlowSpeed(preset)}
                  className={cn(
                    "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)]",
                    "transition-colors duration-[var(--duration-fast)]",
                    annotationPlayback.slowSpeed === preset
                      ? "bg-amber-500 text-[var(--color-text-inverse)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
                  )}
                  title={`Annotation slow speed: ${preset}x`}
                >
                  {preset}x
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

      {/* A-B loop controls */}
      <div className="flex items-center gap-[var(--spacing-1)]">
        <button
          type="button"
          onClick={() => loop.setInPoint(player.currentFrame)}
          className={cn(
            "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors",
            loop.inPoint !== null
              ? "bg-[var(--color-status-warning)] text-[var(--color-text-inverse)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          )}
          title={loop.inPoint !== null ? `In: frame ${loop.inPoint}` : "Set in-point"}
        >
          A
        </button>
        <button
          type="button"
          onClick={() => loop.setOutPoint(player.currentFrame)}
          className={cn(
            "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors",
            loop.outPoint !== null
              ? "bg-[var(--color-status-warning)] text-[var(--color-text-inverse)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          )}
          title={loop.outPoint !== null ? `Out: frame ${loop.outPoint}` : "Set out-point"}
        >
          B
        </button>
        {loop.isLooping && (
          <button
            type="button"
            onClick={loop.clearLoop}
            className="p-[var(--spacing-1)] text-[var(--color-status-warning)] hover:text-[var(--color-status-error)] transition-colors"
            title="Clear A-B loop"
          >
            <Repeat size={14} />
          </button>
        )}
      </div>

      {/* Loop toggle */}
      {onLoopToggle && (
        <button
          type="button"
          onClick={onLoopToggle}
          className={cn(
            "p-[var(--spacing-1)] rounded-[var(--radius-sm)] transition-colors",
            looping
              ? "bg-cyan-500 text-[var(--color-text-inverse)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          )}
          title={looping ? "Looping (R)" : "Loop video (R)"}
        >
          <Repeat size={14} />
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Volume */}
      <VolumeControl
        volume={player.volume}
        isMuted={player.isMuted}
        onVolumeChange={player.setVolume}
        onToggleMute={player.toggleMute}
      />

      {/* Quality */}
      <QualitySelector
        quality={quality}
        onQualityChange={onQualityChange}
      />
    </div>
  );
}
