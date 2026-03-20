/**
 * Compact toolbar for filtering activity console entries (PRD-118).
 *
 * Provides level toggles, source toggles, mode switch,
 * and a search input field.
 */

import { SearchInput } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { TERMINAL_HEADER, TERMINAL_LABEL } from "@/lib/ui-classes";

import { useActivityConsoleStore } from "../stores/useActivityConsoleStore";
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
    <div className={cn(TERMINAL_HEADER, "flex flex-wrap items-center gap-[var(--spacing-3)]")}>
      {/* Level toggles */}
      <div className="flex items-center gap-1.5">
        <span className={cn(TERMINAL_LABEL, "mr-1")}>Level</span>
        {ALL_LEVELS.map((level: ActivityLogLevel) => (
          <button
            key={level}
            type="button"
            onClick={() => toggleLevel(level)}
            className={cn(
              "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
              levels.has(level)
                ? LEVEL_TERMINAL_COLORS[level]
                : "text-[var(--color-text-muted)] opacity-40",
            )}
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
      </div>

      {/* Separator */}
      <span className="opacity-30">|</span>

      {/* Source toggles */}
      <div className="flex items-center gap-1.5">
        <span className={cn(TERMINAL_LABEL, "mr-1")}>Source</span>
        {ALL_SOURCES.map((source: ActivityLogSource) => (
          <button
            key={source}
            type="button"
            onClick={() => toggleSource(source)}
            className={cn(
              "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
              sources.size === 0 || sources.has(source)
                ? SOURCE_TERMINAL_COLORS[source]
                : "text-[var(--color-text-muted)] opacity-40",
            )}
          >
            {SOURCE_LABELS[source]}
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
