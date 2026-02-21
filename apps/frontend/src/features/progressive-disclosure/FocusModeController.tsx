import { cn } from "@/lib/cn";
import { Eye, Edit3 } from "@/tokens/icons";
import { useFocusMode, type FocusMode } from "./useFocusMode";

const MODE_CONFIG: Record<
  NonNullable<FocusMode>,
  { label: string; icon: typeof Eye }
> = {
  review: { label: "Review Focus", icon: Eye },
  generation: { label: "Generation Focus", icon: Edit3 },
};

/**
 * UI control for entering/exiting focus modes (PRD-32).
 *
 * Shows toggle buttons for each focus mode when no mode is active,
 * and an "Exit Focus" button when a mode is active.
 */
export function FocusModeController() {
  const { focusMode, enterFocus, exitFocus } = useFocusMode();

  if (focusMode) {
    const config = MODE_CONFIG[focusMode];
    const Icon = config.icon;
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
          <Icon size={16} aria-hidden="true" />
          {config.label}
        </span>
        <button
          type="button"
          onClick={() => void exitFocus()}
          className={cn(
            "text-xs px-2 py-1 rounded-[var(--radius-sm)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-secondary)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
        >
          Exit Focus
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {(Object.entries(MODE_CONFIG) as [NonNullable<FocusMode>, (typeof MODE_CONFIG)[NonNullable<FocusMode>]][]).map(
        ([mode, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => void enterFocus(mode)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-1 rounded-[var(--radius-sm)]",
                "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                "bg-[var(--color-surface-tertiary)] hover:bg-[var(--color-surface-secondary)]",
                "transition-colors duration-[var(--duration-fast)]",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {config.label}
            </button>
          );
        },
      )}
    </div>
  );
}
