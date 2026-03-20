/**
 * Reusable filtered activity log component.
 *
 * Renders a scrollable, auto-scrolling log of activity entries filtered
 * by a given set of source types. Used by QueueActivityLog and
 * InfrastructureActivityLog to avoid duplicating the same pattern.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { TERMINAL_PANEL, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";

import {
  formatLogTime,
  useActivityConsoleStore,
  useActivityLogStream,
} from "@/features/activity-console";
import type { ActivityLogEntry, ActivityLogSource } from "@/features/activity-console";
import {
  LEVEL_LABELS,
  LEVEL_TERMINAL_COLORS,
  SOURCE_LABELS,
  SOURCE_TERMINAL_COLORS,
} from "@/features/activity-console";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MAX_VISIBLE_ENTRIES = 200;

/* --------------------------------------------------------------------------
   Sub-component: compact log row
   -------------------------------------------------------------------------- */

function FilteredLogRow({ entry }: { entry: ActivityLogEntry }) {
  return (
    <div
      className={cn(
        "flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-0.5 font-mono text-xs",
        TERMINAL_ROW_HOVER,
        "border-l-2",
        entry.level === "error" && "border-l-red-400",
        entry.level === "warn" && "border-l-orange-400",
        entry.level === "info" && "border-l-cyan-400",
        entry.level === "debug" && "border-l-[var(--color-border-default)]",
      )}
    >
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
        {formatLogTime(entry.timestamp)}
      </span>
      <span className={cn("font-mono text-[10px] uppercase tracking-wide min-w-[3.25rem] text-center", LEVEL_TERMINAL_COLORS[entry.level])}>
        {LEVEL_LABELS[entry.level]}
      </span>
      <span className={cn("font-mono text-[10px] uppercase tracking-wide", SOURCE_TERMINAL_COLORS[entry.source])}>
        {SOURCE_LABELS[entry.source]}
      </span>
      <span className="text-[var(--color-text-primary)] truncate">
        {entry.message}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface FilteredActivityLogProps {
  /** Set of activity log sources to include. */
  sources: ReadonlySet<ActivityLogSource>;
  /** Text shown when connected but no entries match. */
  emptyText?: string;
}

export function FilteredActivityLog({
  sources,
  emptyText = "No activity yet",
}: FilteredActivityLogProps) {
  const connectionStatus = useActivityLogStream();
  const entries = useActivityConsoleStore((s) => s.entries);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredEntries = useMemo(() => {
    const filtered = entries.filter((e) => sources.has(e.source));
    return filtered.slice(-MAX_VISIBLE_ENTRIES);
  }, [entries, sources]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEntries.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  const isConnected = connectionStatus === "connected";

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn(TERMINAL_PANEL, "h-[300px] overflow-y-auto")}
    >
      {filteredEntries.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="font-mono text-xs text-[var(--color-text-muted)]">
            {isConnected
              ? emptyText
              : "Not connected to activity stream"}
          </p>
        </div>
      ) : (
        <div className="py-0.5">
          {filteredEntries.map((entry, idx) => (
            <FilteredLogRow key={`${entry.timestamp}-${idx}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
