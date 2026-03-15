import { cn } from "@/lib/cn";
import type { PlaybackQuality } from "../types";

interface QualitySelectorProps {
  quality: PlaybackQuality;
  onQualityChange: (quality: PlaybackQuality) => void;
  className?: string;
}

export function QualitySelector({
  quality,
  onQualityChange,
  className,
}: QualitySelectorProps) {
  return (
    <div className={cn("flex items-center gap-[var(--spacing-1)]", className)}>
      <button
        type="button"
        onClick={() => onQualityChange("proxy")}
        className={cn(
          "px-[var(--spacing-2)] py-0.5 text-xs rounded-[var(--radius-sm)]",
          "transition-colors duration-[var(--duration-fast)]",
          quality === "proxy"
            ? "bg-[var(--color-action-primary)] text-white"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-tertiary)]",
        )}
        title="Preview quality (faster loading)"
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => onQualityChange("full")}
        className={cn(
          "px-[var(--spacing-2)] py-0.5 text-xs rounded-[var(--radius-sm)]",
          "transition-colors duration-[var(--duration-fast)]",
          quality === "full"
            ? "bg-[var(--color-action-primary)] text-white"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-tertiary)]",
        )}
        title="Full quality (original resolution)"
      >
        Full
      </button>
    </div>
  );
}
