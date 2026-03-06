/**
 * Delivery log viewer component (PRD-39 Amendment A.3).
 *
 * Displays delivery log entries with level filtering and expandable details.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { SECTION_HEADING } from "@/lib/ui-classes";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import { useDeliveryLogs } from "./hooks/use-delivery-logs";
import { LOG_LEVEL_BADGE_VARIANT } from "./types";
import type { DeliveryLog } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

type LogFilter = "all" | "error" | "warning";

const FILTER_OPTIONS: { value: LogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface DeliveryLogViewerProps {
  projectId: number;
}

export function DeliveryLogViewer({ projectId }: DeliveryLogViewerProps) {
  const [filter, setFilter] = useState<LogFilter>("all");

  const levelParam = filter === "all" ? undefined : filter;
  const { data: logs = [], isLoading } = useDeliveryLogs(
    projectId,
    levelParam,
    200,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={SECTION_HEADING}>
          Delivery Logs
        </h3>

        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--color-text-muted)]">
          Loading logs...
        </p>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No delivery logs found.
        </p>
      )}

      {logs.length > 0 && (
        <div className="space-y-1">
          {logs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Log Entry Row
   -------------------------------------------------------------------------- */

function LogEntry({ log }: { log: DeliveryLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = log.details != null && Object.keys(log.details).length > 0;

  const variant = LOG_LEVEL_BADGE_VARIANT[log.log_level] ?? "info";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border px-3 py-2",
        log.log_level === "error"
          ? "border-[var(--color-action-danger)]/30 bg-[var(--color-action-danger)]/5"
          : log.log_level === "warning"
            ? "border-[var(--color-action-warning)]/30 bg-[var(--color-action-warning)]/5"
            : "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Expand toggle */}
        {hasDetails ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ) : (
          <span className="mt-0.5 w-[14px] shrink-0" />
        )}

        {/* Level badge */}
        <Badge
          variant={variant}
          size="sm"
        >
          {log.log_level}
        </Badge>

        {/* Message */}
        <span className="flex-1 text-sm text-[var(--color-text-primary)]">
          {log.message}
        </span>

        {/* Timestamp */}
        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
          {formatDateTime(log.created_at)}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <pre className="mt-2 ml-[22px] rounded-[var(--radius-sm)] bg-[var(--color-surface-tertiary)] p-2 text-xs text-[var(--color-text-secondary)] overflow-x-auto">
          {JSON.stringify(log.details, null, 2)}
        </pre>
      )}
    </div>
  );
}
