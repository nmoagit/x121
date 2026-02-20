import { cn } from "@/lib/cn";
import { useId } from "react";

type ToggleSize = "sm" | "md";

interface ToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: ToggleSize;
}

const TRACK_SIZE: Record<ToggleSize, string> = {
  sm: "w-8 h-[18px]",
  md: "w-11 h-6",
};

const THUMB_SIZE: Record<ToggleSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
};

const THUMB_TRANSLATE: Record<ToggleSize, string> = {
  sm: "translate-x-[16px]",
  md: "translate-x-[22px]",
};

export function Toggle({
  checked = false,
  onChange,
  label,
  disabled = false,
  size = "md",
}: ToggleProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-2 select-none",
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
          "relative inline-flex shrink-0 items-center rounded-[var(--radius-full)]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
          TRACK_SIZE[size],
          checked ? "bg-[var(--color-action-primary)]" : "bg-[var(--color-surface-tertiary)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block rounded-[var(--radius-full)] bg-white shadow-sm",
            "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)]",
            "translate-x-0.5",
            THUMB_SIZE[size],
            checked && THUMB_TRANSLATE[size],
          )}
        />
      </button>

      {label && <span className="text-base text-[var(--color-text-primary)]">{label}</span>}
    </label>
  );
}
