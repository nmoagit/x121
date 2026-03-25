/**
 * Trigger execution log table (PRD-97).
 *
 * Paginated table showing trigger execution history with expandable rows.
 */

import { useState } from "react";

import { ContextLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";

import { useTriggerLog } from "./hooks/use-trigger-workflows";
import { LogRow } from "./LogRow";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const COLUMNS = ["Timestamp", "Trigger", "Result", "Chain Depth", "Error"];

const PAGE_SIZE = 20;

/* --------------------------------------------------------------------------
   Table header
   -------------------------------------------------------------------------- */

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-primary)]/50">
        {COLUMNS.map((col) => (
          <th
            key={col}
            className={cn(
              "px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide",
              col === "Chain Depth" && "text-center",
            )}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface TriggerLogTableProps {
  triggerId?: number;
}

export function TriggerLogTable({ triggerId }: TriggerLogTableProps) {
  const [page, setPage] = useState(0);

  const filters: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  };
  if (triggerId != null) {
    filters.trigger_id = String(triggerId);
  }

  const { data: logs, isPending, isError } = useTriggerLog(filters);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="log-loading">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load trigger logs.
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Card elevation="flat" padding="lg">
        <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="log-empty">
          No trigger executions recorded yet.
        </div>
      </Card>
    );
  }

  const hasMore = logs.length === PAGE_SIZE;

  return (
    <div data-testid="trigger-log-table">
      <div
        className={cn(
          "overflow-x-auto",
          "border border-[var(--color-border-default)]",
          "rounded-[var(--radius-lg)]",
          "bg-[var(--color-surface-secondary)]",
        )}
      >
        <table className="w-full text-left">
          <TableHead />
          <tbody>
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className={cn(
            "text-sm px-3 py-1 rounded-[var(--radius-md)]",
            "text-[var(--color-text-secondary)]",
            page === 0
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-[var(--color-surface-tertiary)]",
          )}
        >
          Previous
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          Page {page + 1}
        </span>
        <button
          type="button"
          disabled={!hasMore}
          onClick={() => setPage((p) => p + 1)}
          className={cn(
            "text-sm px-3 py-1 rounded-[var(--radius-md)]",
            "text-[var(--color-text-secondary)]",
            !hasMore
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-[var(--color-surface-tertiary)]",
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
