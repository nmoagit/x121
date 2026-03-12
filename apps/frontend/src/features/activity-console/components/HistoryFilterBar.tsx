/**
 * Compact filter toolbar for the history tab (PRD-118).
 *
 * Matches the ConsoleFilterToolbar layout: single row of inline
 * controls with level/source badge toggles, search, and date inputs.
 */

import { Badge, Input } from "@/components/primitives";
import { Search } from "@/tokens/icons";

import type { ActivityLogLevel, ActivityLogSource } from "../types";
import {
  ALL_LEVELS,
  ALL_SOURCES,
  LEVEL_BADGE_VARIANT,
  LEVEL_LABELS,
  SOURCE_LABELS,
} from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface HistoryFilterBarProps {
  fromDate: string;
  toDate: string;
  searchText: string;
  selectedLevel: ActivityLogLevel | "";
  selectedSource: ActivityLogSource | "";
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onLevelChange: (value: ActivityLogLevel | "") => void;
  onSourceChange: (value: ActivityLogSource | "") => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HistoryFilterBar({
  fromDate,
  toDate,
  searchText,
  selectedLevel,
  selectedSource,
  onFromChange,
  onToChange,
  onSearchChange,
  onLevelChange,
  onSourceChange,
}: HistoryFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
      {/* Level toggles */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">Level</span>
        <button type="button" onClick={() => onLevelChange("")} className="transition-opacity duration-[var(--duration-fast)]">
          <Badge size="sm" variant={selectedLevel === "" ? "info" : "default"}>
            All
          </Badge>
        </button>
        {ALL_LEVELS.map((level) => (
          <button key={level} type="button" onClick={() => onLevelChange(level)} className="transition-opacity duration-[var(--duration-fast)]">
            <Badge
              size="sm"
              variant={selectedLevel === level ? LEVEL_BADGE_VARIANT[level] : "default"}
            >
              {LEVEL_LABELS[level]}
            </Badge>
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Source toggles */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">Source</span>
        <button type="button" onClick={() => onSourceChange("")} className="transition-opacity duration-[var(--duration-fast)]">
          <Badge size="sm" variant={selectedSource === "" ? "info" : "default"}>
            All
          </Badge>
        </button>
        {ALL_SOURCES.map((source) => (
          <button key={source} type="button" onClick={() => onSourceChange(source)} className="transition-opacity duration-[var(--duration-fast)]">
            <Badge
              size="sm"
              variant={selectedSource === source ? "info" : "default"}
            >
              {SOURCE_LABELS[source]}
            </Badge>
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Date range — compact inline inputs without labels */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">From</span>
        <input
          type="datetime-local"
          value={fromDate}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-7 px-1.5 text-xs rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-action-primary)]"
        />
        <span className="text-xs font-medium text-[var(--color-text-muted)] mx-1">To</span>
        <input
          type="datetime-local"
          value={toDate}
          onChange={(e) => onToChange(e.target.value)}
          className="h-7 px-1.5 text-xs rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-action-primary)]"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="w-56">
        <Input
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="!py-1 !text-sm"
        />
      </div>

      {/* Search icon (decorative) */}
      <Search size={16} className="text-[var(--color-text-muted)]" aria-hidden />
    </div>
  );
}
