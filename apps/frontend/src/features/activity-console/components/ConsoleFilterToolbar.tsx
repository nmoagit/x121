/**
 * Compact toolbar for filtering activity console entries (PRD-118).
 *
 * Provides level toggles, source toggles, mode switch,
 * and a search input field.
 */

import { Badge, SearchInput } from "@/components/primitives";

import { useActivityConsoleStore } from "../stores/useActivityConsoleStore";
import type { ActivityLogLevel, ActivityLogSource } from "../types";
import {
  ALL_LEVELS,
  ALL_SOURCES,
  LEVEL_BADGE_VARIANT,
  LEVEL_LABELS,
  SOURCE_LABELS,
} from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConsoleFilterToolbar() {
  const levels = useActivityConsoleStore((s) => s.levels);
  const sources = useActivityConsoleStore((s) => s.sources);
  const searchText = useActivityConsoleStore((s) => s.searchText);
  const toggleLevel = useActivityConsoleStore((s) => s.toggleLevel);
  const toggleSource = useActivityConsoleStore((s) => s.toggleSource);
  const setSearchText = useActivityConsoleStore((s) => s.setSearchText);

  return (
    <div className="flex flex-wrap items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
      {/* Level toggles */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">Level</span>
        {ALL_LEVELS.map((level: ActivityLogLevel) => (
          <button
            key={level}
            type="button"
            onClick={() => toggleLevel(level)}
            className="transition-opacity duration-[var(--duration-fast)]"
          >
            <Badge
              size="sm"
              variant={levels.has(level) ? LEVEL_BADGE_VARIANT[level] : "default"}
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
        {ALL_SOURCES.map((source: ActivityLogSource) => (
          <button
            key={source}
            type="button"
            onClick={() => toggleSource(source)}
            className="transition-opacity duration-[var(--duration-fast)]"
          >
            <Badge
              size="sm"
              variant={
                sources.size === 0 || sources.has(source)
                  ? "info"
                  : "default"
              }
            >
              {SOURCE_LABELS[source]}
            </Badge>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <SearchInput
        placeholder="Search logs..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        size="sm"
        className="w-56"
      />
    </div>
  );
}
