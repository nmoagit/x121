import { cn } from "@/lib/cn";
import { ChevronDown, X } from "@/tokens/icons";
import { useId } from "react";
import type { ChangeEvent } from "react";

type MultiSelectSize = "sm" | "md";

const SIZE_CLASSES: Record<MultiSelectSize, string> = {
  sm: "px-3 py-1.5 pr-8 text-sm",
  md: "px-3 py-2 pr-10 text-base",
};

const ICON_SIZES: Record<MultiSelectSize, number> = {
  sm: 14,
  md: 16,
};

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  /** Available options. */
  options: MultiSelectOption[];
  /** Currently selected values. */
  selected: string[];
  /** Called when the selection changes. */
  onChange: (values: string[]) => void;
  /** Label shown above the dropdown. */
  label?: string;
  /** Placeholder when nothing is selected. Default "All". */
  placeholder?: string;
  /** Visual size. Default "sm". */
  size?: MultiSelectSize;
  /** Show removable chips for selected values. Default true. */
  showChips?: boolean;
  /** Show "Clear all" button when chips are active. Default true. */
  showClearAll?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select dropdown with toggle semantics and optional chips.
 *
 * Selecting a value adds it to the selection. Selecting it again removes it.
 * Selected options show a checkmark in the dropdown. Active selections can
 * optionally be rendered as removable chips below the dropdown.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder = "All",
  size = "sm",
  showChips = true,
  showClearAll = true,
  disabled,
  className,
}: MultiSelectProps) {
  const generatedId = useId();
  const iconSize = ICON_SIZES[size];

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) return;
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
    // Reset to placeholder so the same value can be toggled again
    e.target.value = "";
  }

  const hasSelection = selected.length > 0;

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
          value=""
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
          <option value="">
            {hasSelection ? `${selected.length} selected` : placeholder}
          </option>
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <option key={opt.value} value={opt.value}>
                {isSelected ? "\u2713 " : "\u2003"}{opt.label}
              </option>
            );
          })}
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

      {/* Chips */}
      {showChips && hasSelection && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((val) => {
            const opt = options.find((o) => o.value === val);
            return (
              <span
                key={val}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] px-2 py-0.5 text-xs"
              >
                {opt?.label ?? val}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((v) => v !== val))}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
                  aria-label={`Remove ${opt?.label ?? val}`}
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
          {showClearAll && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
