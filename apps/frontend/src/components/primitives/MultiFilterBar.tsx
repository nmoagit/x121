import { cn } from "@/lib/cn";
import { X } from "@/tokens/icons";
import { MultiSelect } from "./MultiSelect";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  /** Unique key for this filter (used in state). */
  key: string;
  /** Display label shown above the dropdown. */
  label: string;
  /** Available options (without "All" — added automatically). */
  options: FilterOption[];
  /** Currently selected values. */
  selected: string[];
  /** Called when selection changes. */
  onChange: (values: string[]) => void;
  /** Width class for the dropdown. Default "w-40". */
  width?: string;
}

interface MultiFilterBarProps {
  filters: FilterConfig[];
  /** Extra elements to render after filters (e.g. toggles). */
  children?: React.ReactNode;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/**
 * A filter bar with multi-select dropdowns and active filter chips.
 *
 * Each filter renders as a `MultiSelect` that toggles values on/off.
 * Active selections appear as removable chips below the dropdowns
 * with filter-name prefixes. A "Clear all" button resets every filter.
 */
export function MultiFilterBar({ filters, children, className }: MultiFilterBarProps) {
  const hasAnySelection = filters.some((f) => f.selected.length > 0);

  function clearAll() {
    for (const filter of filters) {
      filter.onChange([]);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Dropdowns row */}
      <div className="flex flex-wrap items-end gap-3">
        {filters.map((filter) => (
          <MultiSelect
            key={filter.key}
            label={filter.label}
            options={filter.options}
            selected={filter.selected}
            onChange={filter.onChange}
            placeholder={`All ${filter.label}`}
            showChips={false}
            className={filter.width ?? "w-40"}
          />
        ))}
        {children}
      </div>

      {/* Combined chips row across all filters */}
      {hasAnySelection && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.flatMap((filter) =>
            filter.selected.map((val) => {
              const opt = filter.options.find((o) => o.value === val);
              const chipLabel = `${filter.label}: ${opt?.label ?? val}`;
              return (
                <span
                  key={`${filter.key}-${val}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] px-2 py-0.5 text-xs"
                >
                  {chipLabel}
                  <button
                    type="button"
                    onClick={() => filter.onChange(filter.selected.filter((v) => v !== val))}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
                    aria-label={`Remove ${chipLabel}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            }),
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
