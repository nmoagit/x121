/**
 * Single log entry row for the activity console (PRD-118).
 *
 * Displays timestamp, level badge, source badge, and message
 * in a monospace terminal style. Expandable to show fields JSON.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { ChevronRight } from "@/tokens/icons";
import { cn } from "@/lib/cn";

import type { ActivityLogEntry } from "../types";
import { formatLogTime, LEVEL_BADGE_VARIANT, LEVEL_LABELS, SOURCE_LABELS } from "../types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Check if the entry has non-empty fields worth showing. */
function hasFields(entry: ActivityLogEntry): boolean {
  return Object.keys(entry.fields).length > 0;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LogEntryRowProps {
  entry: ActivityLogEntry;
}

export function LogEntryRow({ entry }: LogEntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = hasFields(entry);

  return (
    <div
      className={cn(
        "border-l-2 px-[var(--spacing-2)] py-0.5 font-mono text-xs",
        "hover:bg-[var(--color-surface-tertiary)] transition-colors duration-[var(--duration-fast)]",
        entry.level === "error" && "border-l-[var(--color-action-danger)]",
        entry.level === "warn" && "border-l-[var(--color-action-warning)]",
        entry.level === "info" && "border-l-[var(--color-action-primary)]",
        entry.level === "debug" && "border-l-[var(--color-border-default)]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-[var(--spacing-2)]",
          expandable && "cursor-pointer",
        )}
        onClick={expandable ? () => setExpanded((prev) => !prev) : undefined}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((prev) => !prev);
                }
              }
            : undefined
        }
      >
        {/* Expand indicator */}
        {expandable && (
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-[var(--color-text-muted)] transition-transform duration-[var(--duration-fast)]",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        )}
        {!expandable && <span className="w-3 shrink-0" />}

        {/* Timestamp */}
        <span className="shrink-0 text-[var(--color-text-muted)]">
          {formatLogTime(entry.timestamp, true)}
        </span>

        {/* Level badge */}
        <Badge size="sm" variant={LEVEL_BADGE_VARIANT[entry.level]} className="min-w-[3.25rem] justify-center">
          {LEVEL_LABELS[entry.level]}
        </Badge>

        {/* Source badge */}
        <Badge size="sm" variant="default" className="min-w-[4.5rem] justify-center">
          {SOURCE_LABELS[entry.source]}
        </Badge>

        {/* Message */}
        <span className="text-[var(--color-text-primary)] truncate">
          {entry.message}
        </span>

        {/* Trace ID (if present) */}
        {entry.trace_id && (
          <span className="ml-auto shrink-0 text-[var(--color-text-muted)]">
            {entry.trace_id.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Expanded fields */}
      {expanded && (
        <pre className="mt-1 ml-7 p-[var(--spacing-2)] text-[10px] leading-relaxed bg-[var(--color-surface-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] overflow-x-auto">
          {JSON.stringify(entry.fields, null, 2)}
        </pre>
      )}
    </div>
  );
}
