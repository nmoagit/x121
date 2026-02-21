import { cn } from "@/lib/cn";
import { frameToTimecode, formatDuration } from "../frame-utils";

interface FrameCounterProps {
  currentFrame: number;
  totalFrames: number;
  currentTime: number;
  duration: number;
  framerate: number;
  className?: string;
}

export function FrameCounter({
  currentFrame,
  totalFrames,
  currentTime,
  duration,
  framerate,
  className,
}: FrameCounterProps) {
  const timecode = frameToTimecode(currentFrame, framerate);
  const durationDisplay = formatDuration(duration);
  const currentDisplay = formatDuration(currentTime);

  return (
    <div
      className={cn(
        "flex items-center gap-[var(--spacing-3)] px-[var(--spacing-2)] py-[var(--spacing-1)]",
        "text-xs font-mono text-[var(--color-text-inverse)] select-none",
        className,
      )}
    >
      <span title="Timecode (HH:MM:SS:FF)">{timecode}</span>
      <span className="text-[var(--color-text-muted)]">|</span>
      <span title="Current frame / Total frames">
        {currentFrame} / {totalFrames}
      </span>
      <span className="text-[var(--color-text-muted)]">|</span>
      <span title="Elapsed / Duration">
        {currentDisplay} / {durationDisplay}
      </span>
    </div>
  );
}
