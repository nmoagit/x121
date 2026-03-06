import { cn } from "@/lib/cn";
import { X } from "@/tokens/icons";

interface RemovableChipProps {
  label: string;
  onRemove: () => void;
  /** aria-label for the remove button. Defaults to "Remove <label>". */
  removeLabel?: string;
  className?: string;
}

/**
 * A small pill chip that displays a text label with a removable X button.
 *
 * Used by ChipInput for local string-array editing and by TagChip for
 * API-backed tag display. Both delegate their chip rendering here.
 */
export function RemovableChip({ label, onRemove, removeLabel, className }: RemovableChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full",
        "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]",
        "px-2 py-0.5 text-xs",
        className,
      )}
    >
      {label}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
        aria-label={removeLabel ?? `Remove ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
