/**
 * Reusable filtered activity log component.
 *
 * Renders a scrollable, auto-scrolling log of activity entries filtered
 * by a given set of source types. Used by QueueActivityLog and
 * InfrastructureActivityLog to avoid duplicating the same pattern.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";

import {
  formatLogTime,
  useActivityConsoleStore,
  useActivityLogStream,
} from "@/features/activity-console";
import type { ActivityLogEntry, ActivityLogSource } from "@/features/activity-console";
import {
  LEVEL_BADGE_VARIANT,
  LEVEL_LABELS,
  SOURCE_LABELS,
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
        "border-l-2",
        entry.level === "error" && "border-l-[var(--color-action-danger)]",
        entry.level === "warn" && "border-l-[var(--color-action-warning)]",
        entry.level === "info" && "border-l-[var(--color-action-primary)]",
        entry.level === "debug" && "border-l-[var(--color-border-default)]",
      )}
    >
      <span className="shrink-0 text-[var(--color-text-muted)]">
        {formatLogTime(entry.timestamp)}
      </span>
      <Badge size="sm" variant={LEVEL_BADGE_VARIANT[entry.level]} className="min-w-[3.25rem] justify-center">
        {LEVEL_LABELS[entry.level]}
      </Badge>
      <Badge size="sm" variant="default">
        {SOURCE_LABELS[entry.source]}
      </Badge>
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
      className="h-[300px] overflow-y-auto bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)]"
    >
      {filteredEntries.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-[var(--color-text-muted)]">
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
