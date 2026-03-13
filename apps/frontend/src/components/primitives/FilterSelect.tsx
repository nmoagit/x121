import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";
import { useId } from "react";
import type { ChangeEvent } from "react";

type FilterSelectSize = "sm" | "md";

const SIZE_CLASSES: Record<FilterSelectSize, string> = {
  sm: "px-3 py-1.5 pr-8 text-sm",
  md: "px-3 py-2 pr-10 text-base",
};

const ICON_SIZES: Record<FilterSelectSize, number> = {
  sm: 14,
  md: 16,
};

interface FilterSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FilterSelectProps {
  options: FilterSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** Visual size matching Button sizes. Default "md". */
  size?: FilterSelectSize;
  disabled?: boolean;
  className?: string;
}

export function FilterSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  size = "md",
  disabled,
  className,
}: FilterSelectProps) {
  const generatedId = useId();
  const iconSize = ICON_SIZES[size];

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange?.(e.target.value);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={generatedId}
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={generatedId}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            "w-full appearance-none",
            SIZE_CLASSES[size],
            "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
            "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            "focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]",
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
          size={iconSize}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none",
            size === "sm" ? "right-2" : "right-3",
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
