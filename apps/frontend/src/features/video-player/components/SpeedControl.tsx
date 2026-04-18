import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

interface SpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
  className?: string;
}

export function SpeedControl({ speed, onSpeedChange, className }: SpeedControlProps) {
  return (
    <div className={cn("flex items-center gap-[var(--spacing-1)]", className)}>
      {SPEED_PRESETS.map((preset) => (
        <Tooltip key={preset} content={`${preset}x speed`}>
          <button
            type="button"
            onClick={() => onSpeedChange(preset)}
            className={cn(
              "px-[var(--spacing-1)] py-0.5 text-[10px] font-mono rounded-[var(--radius-sm)]",
              "transition-colors duration-[var(--duration-fast)]",
              speed === preset
                ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]",
            )}
          >
            {preset}x
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
