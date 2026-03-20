import { cn } from "@/lib/cn";
import { useId } from "react";

type ToggleSize = "xs" | "sm" | "md";

interface ToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: ToggleSize;
  /** Use pill shape instead of the default rectangular track. */
  pill?: boolean;
}

const TRACK_SIZE: Record<ToggleSize, string> = {
  xs: "w-6 h-3.5",
  sm: "w-7 h-4",
  md: "w-11 h-6",
};

const THUMB_SIZE: Record<ToggleSize, string> = {
  xs: "w-2.5 h-2.5",
  sm: "w-3 h-3",
  md: "w-5 h-5",
};

const THUMB_TRANSLATE: Record<ToggleSize, string> = {
  xs: "translate-x-[10px]",
  sm: "translate-x-[12px]",
  md: "translate-x-[22px]",
};

const LABEL_SIZE: Record<ToggleSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
};

export function Toggle({
  checked = false,
  onChange,
  label,
  disabled = false,
  size = "md",
  pill = false,
}: ToggleProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-1.5 select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center",
          pill ? "rounded-[var(--radius-full)]" : "rounded-[3px]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
          TRACK_SIZE[size],
          checked ? "bg-[var(--color-action-primary)]" : "bg-[var(--color-surface-tertiary)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block bg-white shadow-sm",
            pill ? "rounded-[var(--radius-full)]" : "rounded-[2px]",
            "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)]",
            "translate-x-0.5",
            THUMB_SIZE[size],
            checked && THUMB_TRANSLATE[size],
          )}
        />
      </button>

      {label && <span className={cn(LABEL_SIZE[size], "text-[var(--color-text-primary)]")}>{label}</span>}
    </label>
  );
}
