/**
 * History tab for browsing persisted activity logs (PRD-118).
 *
 * Provides date range filters, level/source selection, paginated
 * results via REST API, and a download/export button.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { AlertCircle } from "@/tokens/icons";

import { useActivityLogHistory } from "../hooks/useActivityLogHistory";
import type { ActivityLogEntry, ActivityLogLevel, ActivityLogQueryParams, ActivityLogRow, ActivityLogSource } from "../types";
import { LEVEL_ID_MAP, SOURCE_ID_MAP } from "../types";
import { HistoryFilterBar } from "./HistoryFilterBar";
import { LogEntryRow } from "./LogEntryRow";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const PAGE_SIZE = 50;

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

  /** Reset pagination when any filter changes. */
  const resetOffset = () => setOffset(0);

  return (
    <Stack gap={4}>
      <HistoryFilterBar
        fromDate={fromDate}
        toDate={toDate}
        searchText={searchText}
        selectedLevel={selectedLevel}
        selectedSource={selectedSource}
        canExport={!!data?.items?.length}
        onFromChange={(v) => { setFromDate(v); resetOffset(); }}
        onToChange={(v) => { setToDate(v); resetOffset(); }}
        onSearchChange={(v) => { setSearchText(v); resetOffset(); }}
        onLevelChange={(v) => { setSelectedLevel(v); resetOffset(); }}
        onSourceChange={(v) => { setSelectedSource(v); resetOffset(); }}
        onExport={handleExport}
      />

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-[var(--spacing-8)]">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
          <AlertCircle size={24} className="text-[var(--color-action-danger)]" aria-hidden />
          <p className="text-sm text-[var(--color-text-muted)]">
            Failed to load activity logs.
          </p>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="border border-[var(--color-border-default)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-surface-primary)]">
          <div className="max-h-[60vh] overflow-y-auto">
            {data.items.map((row, idx) => (
              <LogEntryRow key={`${row.timestamp}-${idx}`} entry={rowToEntry(row)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            No log entries match the current filters.
          </p>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">
            {data.total.toLocaleString()} total entries
          </span>
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="text-sm text-[var(--color-text-secondary)]">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Stack>
  );
}
