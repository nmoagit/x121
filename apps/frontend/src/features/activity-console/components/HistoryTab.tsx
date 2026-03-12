/**
 * History tab for browsing persisted activity logs (PRD-118).
 *
 * Structure is copied directly from ActivityConsolePanel to guarantee
 * pixel-identical layout — only the data source and controls differ.
 */

import { useCallback, useMemo, useState } from "react";

import { Badge, Button, Input, Spinner } from "@/components/primitives";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "@/tokens/icons";

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
  LEVEL_BADGE_VARIANT,
  LEVEL_ID_MAP,
  LEVEL_LABELS,
  SOURCE_ID_MAP,
  SOURCE_LABELS,
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

  /* ---- JSX mirrors ActivityConsolePanel exactly ---- */
  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Filter toolbar — same wrapper div as ConsoleFilterToolbar */}
      <div className="flex flex-wrap items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        {/* Level toggles */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">Level</span>
          <button type="button" onClick={() => { setSelectedLevel(""); resetOffset(); }} className="transition-opacity duration-[var(--duration-fast)]">
            <Badge size="sm" variant={selectedLevel === "" ? "info" : "default"}>All</Badge>
          </button>
          {ALL_LEVELS.map((level) => (
            <button key={level} type="button" onClick={() => { setSelectedLevel(level); resetOffset(); }} className="transition-opacity duration-[var(--duration-fast)]">
              <Badge size="sm" variant={selectedLevel === level ? LEVEL_BADGE_VARIANT[level] : "default"}>
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
          <button type="button" onClick={() => { setSelectedSource(""); resetOffset(); }} className="transition-opacity duration-[var(--duration-fast)]">
            <Badge size="sm" variant={selectedSource === "" ? "info" : "default"}>All</Badge>
          </button>
          {ALL_SOURCES.map((source) => (
            <button key={source} type="button" onClick={() => { setSelectedSource(source); resetOffset(); }} className="transition-opacity duration-[var(--duration-fast)]">
              <Badge size="sm" variant={selectedSource === source ? "info" : "default"}>
                {SOURCE_LABELS[source]}
              </Badge>
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--color-border-default)]" />

        {/* Date range */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">From</span>
          <input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); resetOffset(); }}
            className="h-7 px-1.5 text-xs rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-action-primary)]"
          />
          <span className="text-xs font-medium text-[var(--color-text-muted)] mx-1">To</span>
          <input
            type="datetime-local"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); resetOffset(); }}
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
            onChange={(e) => { setSearchText(e.target.value); resetOffset(); }}
            className="!py-1 !text-sm"
          />
        </div>

        {/* Search icon (decorative) */}
        <Search size={16} className="text-[var(--color-text-muted)]" aria-hidden />
      </div>

      {/* Status bar — same wrapper div as ActivityConsolePanel */}
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-1)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Badge size="sm" variant="info">History</Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            {data ? data.total.toLocaleString() : "—"} entries
          </span>
        </div>

        <div className="flex items-center gap-1">
          {data && data.total > PAGE_SIZE && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                icon={<ChevronLeft size={14} />}
                aria-label="Previous page"
              />
              <span className="text-xs text-[var(--color-text-muted)]">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                icon={<ChevronRight size={14} />}
                aria-label="Next page"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={!data?.items?.length}
            icon={<Download size={14} />}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Log entries — same wrapper div as ActivityConsolePanel */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <AlertCircle size={24} className="text-[var(--color-action-danger)]" aria-hidden />
            <p className="text-sm text-[var(--color-text-muted)] ml-2">
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
            <p className="text-sm text-[var(--color-text-muted)]">
              No log entries match the current filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
