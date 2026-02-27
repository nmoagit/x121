/**
 * Filter controls for the history tab (PRD-118).
 *
 * Date range pickers, search input, level/source selectors,
 * and an export button.
 */

import { Badge, Button, Input } from "@/components/primitives";
import { Download } from "@/tokens/icons";

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
  canExport: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onLevelChange: (value: ActivityLogLevel | "") => void;
  onSourceChange: (value: ActivityLogSource | "") => void;
  onExport: () => void;
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
  canExport,
  onFromChange,
  onToChange,
  onSearchChange,
  onLevelChange,
  onSourceChange,
  onExport,
}: HistoryFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
      <div className="w-48">
        <Input
          label="From"
          type="datetime-local"
          value={fromDate}
          onChange={(e) => onFromChange(e.target.value)}
          className="!text-sm"
        />
      </div>
      <div className="w-48">
        <Input
          label="To"
          type="datetime-local"
          value={toDate}
          onChange={(e) => onToChange(e.target.value)}
          className="!text-sm"
        />
      </div>
      <div className="w-48">
        <Input
          label="Search"
          placeholder="Filter messages..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="!text-sm"
        />
      </div>

      {/* Level filter */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Level</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onLevelChange("")}>
            <Badge size="sm" variant={selectedLevel === "" ? "info" : "default"}>
              All
            </Badge>
          </button>
          {ALL_LEVELS.map((level) => (
            <button key={level} type="button" onClick={() => onLevelChange(level)}>
              <Badge
                size="sm"
                variant={selectedLevel === level ? LEVEL_BADGE_VARIANT[level] : "default"}
              >
                {LEVEL_LABELS[level]}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Source filter */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Source</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onSourceChange("")}>
            <Badge size="sm" variant={selectedSource === "" ? "info" : "default"}>
              All
            </Badge>
          </button>
          {ALL_SOURCES.map((source) => (
            <button key={source} type="button" onClick={() => onSourceChange(source)}>
              <Badge
                size="sm"
                variant={selectedSource === source ? "info" : "default"}
              >
                {SOURCE_LABELS[source]}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export */}
      <Button
        variant="secondary"
        size="sm"
        onClick={onExport}
        disabled={!canExport}
        icon={<Download size={14} />}
      >
        Export JSON
      </Button>
    </div>
  );
}
