/**
 * Compact filter toolbar for the history tab (PRD-118).
 *
 * Matches the ConsoleFilterToolbar layout: single row of inline
 * controls with level/source badge toggles, search, and date inputs.
 */

import { SearchInput } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  TERMINAL_HEADER,
  TERMINAL_LABEL,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";

import type { ActivityLogLevel, ActivityLogSource } from "../types";
import {
  ALL_LEVELS,
  ALL_SOURCES,
  LEVEL_LABELS,
  LEVEL_TERMINAL_COLORS,
  SOURCE_LABELS,
  SOURCE_TERMINAL_COLORS,
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
    <div className={cn(TERMINAL_HEADER, "flex flex-wrap items-center gap-[var(--spacing-3)]")}>
      {/* Level toggles */}
      <div className="flex items-center gap-1.5">
        <span className={cn(TERMINAL_LABEL, "mr-1")}>Level</span>
        <button type="button" onClick={() => onLevelChange("")} className={cn(
          "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
          selectedLevel === "" ? "text-cyan-400" : "text-[var(--color-text-muted)] opacity-40",
        )}>
          All
        </button>
        {ALL_LEVELS.map((level) => (
          <button key={level} type="button" onClick={() => onLevelChange(level)} className={cn(
            "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
            selectedLevel === level ? LEVEL_TERMINAL_COLORS[level] : "text-[var(--color-text-muted)] opacity-40",
          )}>
            {LEVEL_LABELS[level]}
          </button>
        ))}
      </div>

      {/* Separator */}
      <span className="opacity-30">|</span>

      {/* Source toggles */}
      <div className="flex items-center gap-1.5">
        <span className={cn(TERMINAL_LABEL, "mr-1")}>Source</span>
        <button type="button" onClick={() => onSourceChange("")} className={cn(
          "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
          selectedSource === "" ? "text-cyan-400" : "text-[var(--color-text-muted)] opacity-40",
        )}>
          All
        </button>
        {ALL_SOURCES.map((source) => (
          <button key={source} type="button" onClick={() => onSourceChange(source)} className={cn(
            "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
            selectedSource === source ? SOURCE_TERMINAL_COLORS[source] : "text-[var(--color-text-muted)] opacity-40",
          )}>
            {SOURCE_LABELS[source]}
          </button>
        ))}
      </div>

      {/* Separator */}
      <span className="opacity-30">|</span>

      {/* Date range */}
      <div className="flex items-center gap-1">
        <span className={cn(TERMINAL_LABEL, "mr-1")}>From</span>
        <input
          type="datetime-local"
          value={fromDate}
          onChange={(e) => onFromChange(e.target.value)}
          className={cn(TERMINAL_SELECT, "h-6")}
        />
        <span className={cn(TERMINAL_LABEL, "mx-1")}>To</span>
        <input
          type="datetime-local"
          value={toDate}
          onChange={(e) => onToChange(e.target.value)}
          className={cn(TERMINAL_SELECT, "h-6")}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <SearchInput
        placeholder="Search logs..."
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        size="sm"
        className="w-56"
      />
    </div>
  );
}
