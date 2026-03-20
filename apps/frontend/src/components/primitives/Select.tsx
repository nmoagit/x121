import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";
import { useId } from "react";
import type { ChangeEvent } from "react";

type SelectSize = "sm" | "md";

const SIZE_CLASSES: Record<SelectSize, string> = {
  sm: "px-2 py-1 pr-8 text-xs",
  md: "px-3 py-2 pr-10 text-base",
};

const ICON_SIZES: Record<SelectSize, number> = {
  sm: 14,
  md: 16,
};

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  /** Visual size. Default "md". */
  size?: SelectSize;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  label,
  error,
  disabled,
  size = "md",
  className,
}: SelectProps) {
  const generatedId = useId();
  const selectId = generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const iconSize = ICON_SIZES[size];

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange?.(e.target.value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            "w-full appearance-none",
            SIZE_CLASSES[size],
            "bg-transparent text-[var(--color-text-primary)] font-mono",
            "border rounded-[var(--color-border-default)] rounded-[var(--radius-md)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            error
              ? "border-[var(--color-border-error)] focus:ring-[var(--color-border-error)]"
              : "border-[var(--color-border-default)] focus:ring-[var(--color-border-focus)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "[&>option]:bg-[#161b22] [&>option]:text-[var(--color-text-primary)]",
            className,
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={iconSize}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none",
            size === "sm" ? "right-2" : "right-3",
          )}
          aria-hidden="true"
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--color-action-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
