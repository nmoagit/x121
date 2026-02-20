import { cn } from "@/lib/cn";
import { Check, Minus } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { useEffect, useId, useRef } from "react";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  indeterminate?: boolean;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  indeterminate = false,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const isActive = checked || indeterminate;

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-2 select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <input
          ref={inputRef}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer sr-only"
          aria-checked={indeterminate ? "mixed" : checked}
        />
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5",
            "border rounded-[var(--radius-sm)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-border-focus)] peer-focus-visible:ring-offset-1",
            isActive
              ? "bg-[var(--color-action-primary)] border-[var(--color-action-primary)]"
              : "bg-[var(--color-surface-secondary)] border-[var(--color-border-default)]",
          )}
          aria-hidden="true"
        >
          {indeterminate ? (
            <Minus size={iconSizes.sm} className="text-[var(--color-text-inverse)]" />
          ) : checked ? (
            <Check size={iconSizes.sm} className="text-[var(--color-text-inverse)]" />
          ) : null}
        </span>
      </span>

      {label && <span className="text-base text-[var(--color-text-primary)]">{label}</span>}
    </label>
  );
}
