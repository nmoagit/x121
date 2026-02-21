import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight, Pause, Play, Repeat } from "@/tokens/icons";

import type { ABLoopControls } from "../hooks/use-ab-loop";
import type { VideoPlayerControls } from "../hooks/use-video-player";
import type { PlaybackQuality } from "../types";
import { QualitySelector } from "./QualitySelector";
import { SpeedControl } from "./SpeedControl";
import { VolumeControl } from "./VolumeControl";

interface TransportControlsProps {
  player: VideoPlayerControls;
  loop: ABLoopControls;
  quality: PlaybackQuality;
  onQualityChange: (quality: PlaybackQuality) => void;
  className?: string;
}

export function TransportControls({
  player,
  loop,
  quality,
  onQualityChange,
  className,
}: TransportControlsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-[var(--spacing-1)]",
        className,
      )}
    >
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
        className="p-[var(--spacing-1)] text-[var(--color-text-inverse)] hover:text-[var(--color-action-primary)] transition-colors"
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

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

      {/* Speed presets */}
      <SpeedControl speed={player.speed} onSpeedChange={player.setSpeed} />

      {/* Separator */}
      <div className="w-px h-4 bg-[var(--color-border-secondary)] mx-[var(--spacing-1)]" />

      {/* A-B loop controls */}
      <div className="flex items-center gap-[var(--spacing-1)]">
        <button
          type="button"
          onClick={() => loop.setInPoint(player.currentFrame)}
          className={cn(
            "px-[var(--spacing-1)] py-0.5 text-xs rounded-[var(--radius-sm)] transition-colors",
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
            "px-[var(--spacing-1)] py-0.5 text-xs rounded-[var(--radius-sm)] transition-colors",
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
