/**
 * Single log entry row for the activity console (PRD-118).
 *
 * Displays timestamp, level badge, source badge, and message
 * in a monospace terminal style. Expandable to show fields JSON.
 */

import { useState } from "react";

import { ChevronRight } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { TERMINAL_ROW_HOVER } from "@/lib/ui-classes";

import type { ActivityLogEntry } from "../types";
import {
  formatLogTime,
  LEVEL_LABELS,
  LEVEL_TERMINAL_COLORS,
  SOURCE_LABELS,
  SOURCE_TERMINAL_COLORS,
} from "../types";

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
        TERMINAL_ROW_HOVER,
        entry.level === "error" && "border-l-red-400",
        entry.level === "warn" && "border-l-orange-400",
        entry.level === "info" && "border-l-cyan-400",
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
        <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
          {formatLogTime(entry.timestamp, true)}
        </span>

        {/* Level — monospace colored text */}
        <span className={cn("font-mono text-[10px] uppercase tracking-wide min-w-[3.25rem] text-center", LEVEL_TERMINAL_COLORS[entry.level])}>
          {LEVEL_LABELS[entry.level]}
        </span>

        {/* Source — monospace colored text */}
        <span className={cn("font-mono text-[10px] uppercase tracking-wide min-w-[4.5rem] text-center", SOURCE_TERMINAL_COLORS[entry.source])}>
          {SOURCE_LABELS[entry.source]}
        </span>

        {/* Message */}
        <span className="text-[var(--color-text-primary)] truncate">
          {entry.message}
        </span>

        {/* Trace ID (if present) */}
        {entry.trace_id && (
          <span className="ml-auto shrink-0 text-[var(--color-text-muted)] opacity-60">
            {entry.trace_id.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Expanded fields */}
      {expanded && (
        <pre className="mt-1 ml-7 p-[var(--spacing-2)] text-[10px] leading-relaxed bg-[#0d1117] rounded-[var(--radius-sm)] text-cyan-400 overflow-x-auto">
          {JSON.stringify(entry.fields, null, 2)}
        </pre>
      )}
    </div>
  );
}
