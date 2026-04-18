import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  ScanEye,
  SkipBack,
} from "@/tokens/icons";

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
      <Tooltip content="Replay from start">
        <button
          type="button"
          onClick={() => {
            player.seekToTime(0);
            player.play();
          }}
          className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <SkipBack size={14} />
        </button>
      </Tooltip>

      {/* Step backward */}
      <Tooltip content="Step backward (frame)">
        <button
          type="button"
          onClick={player.stepBackward}
          className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
      </Tooltip>

      {/* Play / Pause */}
      <Tooltip content={player.isPlaying ? "Pause" : "Play"}>
        <button
          type="button"
          onClick={player.togglePlay}
          className="p-[var(--spacing-1)] text-[var(--color-text-primary)] hover:text-[var(--color-action-primary)] transition-colors"
        >
          {player.isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </Tooltip>

      {/* Step forward */}
      <Tooltip content="Step forward (frame)">
        <button
          type="button"
          onClick={player.stepForward}
          className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </Tooltip>

      {/* Back 5 seconds */}
      <Tooltip content="Back 5 seconds">
        <button
          type="button"
          onClick={() => player.seekToTime(Math.max(0, player.currentTime - 5))}
          className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </Tooltip>

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
          <Tooltip content="Annotation playback mode">
            <button
              type="button"
              onClick={annotationPlayback.toggle}
              className={cn(
                "p-[var(--spacing-1)] rounded-[var(--radius-sm)] transition-colors",
                annotationPlayback.isEnabled
                  ? "bg-amber-500 text-[var(--color-text-inverse)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <ScanEye size={14} />
            </button>
          </Tooltip>

          {/* Slow-speed presets — only visible when annotation mode is active */}
          {annotationPlayback.isEnabled && (
            <div className="flex items-center gap-0.5">
              {ANNOTATION_SLOW_PRESETS.map((preset) => (
                <Tooltip key={preset} content={`Annotation slow speed: ${preset}x`}>
                  <button
                    type="button"
                    onClick={() => annotationPlayback.setSlowSpeed(preset)}
                    className={cn(
                      "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)]",
                      "transition-colors duration-[var(--duration-fast)]",
                      annotationPlayback.slowSpeed === preset
                        ? "bg-amber-500 text-[var(--color-text-inverse)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
                    )}
                  >
                    {preset}x
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

      {/* A-B loop controls */}
      <div className="flex items-center gap-[var(--spacing-1)]">
        <Tooltip content={loop.inPoint !== null ? `In: frame ${loop.inPoint}` : "Set in-point"}>
          <button
            type="button"
            onClick={() => loop.setInPoint(player.currentFrame)}
            className={cn(
              "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors",
              loop.inPoint !== null
                ? "bg-[var(--color-status-warning)] text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            A
          </button>
        </Tooltip>
        <Tooltip content={loop.outPoint !== null ? `Out: frame ${loop.outPoint}` : "Set out-point"}>
          <button
            type="button"
            onClick={() => loop.setOutPoint(player.currentFrame)}
            className={cn(
              "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)] transition-colors",
              loop.outPoint !== null
                ? "bg-[var(--color-status-warning)] text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            B
          </button>
        </Tooltip>
        {loop.isLooping && (
          <Tooltip content="Clear A-B loop">
            <button
              type="button"
              onClick={loop.clearLoop}
              className="p-[var(--spacing-1)] text-[var(--color-status-warning)] hover:text-[var(--color-status-error)] transition-colors"
            >
              <Repeat size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Loop toggle */}
      {onLoopToggle && (
        <Tooltip content={looping ? "Looping (R)" : "Loop video (R)"}>
          <button
            type="button"
            onClick={onLoopToggle}
            className={cn(
              "p-[var(--spacing-1)] rounded-[var(--radius-sm)] transition-colors",
              looping
                ? "bg-cyan-500 text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <Repeat size={14} />
          </button>
        </Tooltip>
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
      <QualitySelector quality={quality} onQualityChange={onQualityChange} />
    </div>
  );
}
