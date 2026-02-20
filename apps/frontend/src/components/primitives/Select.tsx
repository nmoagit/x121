import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { useId } from "react";
import type { ChangeEvent } from "react";

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
}

export function Select({
  options,
  value,
  onChange,
  placeholder,
  label,
  error,
  disabled,
}: SelectProps) {
  const generatedId = useId();
  const selectId = generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange?.(e.target.value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-[var(--color-text-secondary)]"
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
            "w-full appearance-none px-3 py-2 pr-10 text-base",
            "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
            "border rounded-[var(--radius-md)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            error
              ? "border-[var(--color-border-error)] focus:ring-[var(--color-border-error)]"
              : "border-[var(--color-border-default)] focus:ring-[var(--color-border-focus)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
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
          size={iconSizes.md}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
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
