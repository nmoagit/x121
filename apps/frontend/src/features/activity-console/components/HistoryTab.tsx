/**
 * History tab for browsing persisted activity logs (PRD-118).
 *
 * Structure is copied directly from ActivityConsolePanel to guarantee
 * pixel-identical layout — only the data source and controls differ.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, SearchInput ,  ContextLoader } from "@/components/primitives";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
} from "@/tokens/icons";
import { cn } from "@/lib/cn";
import {
  TERMINAL_HEADER,
  TERMINAL_LABEL,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";

import { useActivityLogHistory } from "../hooks/useActivityLogHistory";
import type {
  ActivityLogEntry,
  ActivityLogLevel,
  ActivityLogQueryParams,
  ActivityLogRow,
  ActivityLogSource,
} from "../types";
import {
  ALL_LEVELS,
  ALL_SOURCES,
  LEVEL_ID_MAP,
  LEVEL_LABELS,
  LEVEL_TERMINAL_COLORS,
  SOURCE_ID_MAP,
  SOURCE_LABELS,
  SOURCE_TERMINAL_COLORS,
} from "../types";
import { LogEntryRow } from "./LogEntryRow";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZE = 1000;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Convert a REST `ActivityLogRow` (numeric IDs) to `ActivityLogEntry` (string enums). */
function rowToEntry(row: ActivityLogRow): ActivityLogEntry {
  return {
    type: "entry",
    timestamp: row.timestamp,
    level: LEVEL_ID_MAP[row.level_id] ?? "info",
    source: SOURCE_ID_MAP[row.source_id] ?? "api",
    message: row.message,
    fields: row.fields,
    category: row.category as ActivityLogEntry["category"],
    entity_type: row.entity_type ?? undefined,
    entity_id: row.entity_id ?? undefined,
    user_id: row.user_id ?? undefined,
    job_id: row.job_id ?? undefined,
    project_id: row.project_id ?? undefined,
    trace_id: row.trace_id ?? undefined,
  };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HistoryTab() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<ActivityLogLevel | "">("");
  const [selectedSource, setSelectedSource] = useState<ActivityLogSource | "">("");
  const [offset, setOffset] = useState(0);

  const queryParams = useMemo<ActivityLogQueryParams>(() => ({
    from: fromDate || undefined,
    to: toDate || undefined,
    search: searchText || undefined,
    level: selectedLevel || undefined,
    source: selectedSource || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [fromDate, toDate, searchText, selectedLevel, selectedSource, offset]);

  const { data, isLoading, error } = useActivityLogHistory(queryParams);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleExport = useCallback(() => {
    if (!data?.items) return;
    const blob = new Blob([JSON.stringify(data.items, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const resetOffset = () => setOffset(0);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
      {/* Filter toolbar */}
      <div className={cn(TERMINAL_HEADER, "flex flex-wrap items-center gap-[var(--spacing-3)]")}>
        {/* Level toggles */}
        <div className="flex items-center gap-1.5">
          <span className={cn(TERMINAL_LABEL, "mr-1")}>Level</span>
          <button type="button" onClick={() => { setSelectedLevel(""); resetOffset(); }} className={cn(
            "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
            selectedLevel === "" ? "text-cyan-400" : "text-[var(--color-text-muted)] opacity-40",
          )}>
            All
          </button>
          {ALL_LEVELS.map((level) => (
            <button key={level} type="button" onClick={() => { setSelectedLevel(level); resetOffset(); }} className={cn(
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
          <button type="button" onClick={() => { setSelectedSource(""); resetOffset(); }} className={cn(
            "font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition-opacity",
            selectedSource === "" ? "text-cyan-400" : "text-[var(--color-text-muted)] opacity-40",
          )}>
            All
          </button>
          {ALL_SOURCES.map((source) => (
            <button key={source} type="button" onClick={() => { setSelectedSource(source); resetOffset(); }} className={cn(
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
            onChange={(e) => { setFromDate(e.target.value); resetOffset(); }}
            className={cn(TERMINAL_SELECT, "h-6")}
          />
          <span className={cn(TERMINAL_LABEL, "mx-1")}>To</span>
          <input
            type="datetime-local"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); resetOffset(); }}
            className={cn(TERMINAL_SELECT, "h-6")}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <SearchInput
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); resetOffset(); }}
          size="sm"
          className="w-56"
        />
      </div>

      {/* Status bar */}
      <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className="font-mono text-[10px] uppercase tracking-wide text-cyan-400">History</span>
          <span className="opacity-30">|</span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {data ? data.total.toLocaleString() : "\u2014"} entries
          </span>
        </div>

        <div className="flex items-center gap-1">
          {data && data.total > PAGE_SIZE && (
            <>
              <Button
                variant="ghost"
                size="xs"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                icon={<ChevronLeft size={12} />}
                aria-label="Previous page"
              />
              <span className="font-mono text-xs text-[var(--color-text-muted)]">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="xs"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                icon={<ChevronRight size={12} />}
                aria-label="Next page"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={handleExport}
            disabled={!data?.items?.length}
            icon={<Download size={12} />}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-[#0d1117] scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <ContextLoader size={64} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <AlertCircle size={24} className="text-red-400" aria-hidden />
            <p className="font-mono text-xs text-[var(--color-text-muted)] ml-2">
              Failed to load activity logs.
            </p>
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="py-0.5">
            {data.items.map((row, idx) => (
              <LogEntryRow key={`${row.timestamp}-${idx}`} entry={rowToEntry(row)} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              No log entries match the current filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
