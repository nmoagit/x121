/**
 * Top toolbar for the comparison gallery (PRD-68).
 *
 * Provides sort, filter, variant toggle, bulk approve, and cell count.
 */

import { Button, Select, Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Check, ChevronUp, ChevronDown } from "@/tokens/icons";

import type { GalleryFilters, GallerySort, SortField } from "./types";
import { SORT_OPTIONS, STATUS_FILTER_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GalleryControlsProps {
  sort: GallerySort;
  onSortChange: (sort: GallerySort) => void;
  onToggleDirection: () => void;
  filters: GalleryFilters;
  onFiltersChange: (filters: GalleryFilters) => void;
  onApproveAllPassing?: () => void;
  cellCount: number;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GalleryControls({
  sort,
  onSortChange,
  onToggleDirection,
  filters,
  onFiltersChange,
  onApproveAllPassing,
  cellCount,
  className,
}: GalleryControlsProps) {
  const handleSortFieldChange = (value: string) => {
    onSortChange({ field: value as SortField, direction: sort.direction });
  };

  const handleStatusFilterChange = (value: string) => {
    onFiltersChange({
      ...filters,
      status: value
        ? (value as GalleryFilters["status"])
        : undefined,
    });
  };

  const DirectionIcon = sort.direction === "asc" ? ChevronUp : ChevronDown;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-[var(--spacing-3)]",
        "px-[var(--spacing-3)] py-[var(--spacing-2)]",
        "bg-[var(--color-surface-primary)] border border-[var(--color-border-default)]",
        "rounded-[var(--radius-md)]",
        className,
      )}
    >
      {/* Sort field */}
      <div className="flex items-center gap-[var(--spacing-1)]">
        <Select
          options={SORT_OPTIONS}
          value={sort.field}
          onChange={handleSortFieldChange}
          label="Sort by"
        />
        <Tooltip content={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`}>
          <button
            type="button"
            onClick={onToggleDirection}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <DirectionIcon size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Status filter */}
      <Select
        options={STATUS_FILTER_OPTIONS}
        value={filters.status ?? ""}
        onChange={handleStatusFilterChange}
        label="Status"
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Approve all passing */}
      {onApproveAllPassing && (
        <Button
          variant="secondary"
          size="sm"
          icon={<Check size={14} />}
          onClick={onApproveAllPassing}
        >
          Approve All Passing
        </Button>
      )}

      {/* Cell count */}
      <span className="text-sm text-[var(--color-text-muted)] whitespace-nowrap">
        {cellCount} {cellCount === 1 ? "cell" : "cells"}
      </span>
    </div>
  );
}
