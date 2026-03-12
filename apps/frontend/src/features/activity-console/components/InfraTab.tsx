/**
 * Infrastructure tab for the activity console.
 *
 * Shows only infrastructure-source activity (autoscaling, provisioning,
 * instance lifecycle) from the live WebSocket stream, filtered to remove
 * all other noise.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { useActivityLogStream } from "../hooks/useActivityLogStream";
import { useActivityConsoleStore } from "../stores/useActivityConsoleStore";
import type { ActivityLogEntry } from "../types";
import { formatLogTime, LEVEL_BADGE_VARIANT, LEVEL_LABELS } from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MAX_VISIBLE = 500;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function InfraTab() {
  const connectionStatus = useActivityLogStream();
  const entries = useActivityConsoleStore((s) => s.entries);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const infraEntries = useMemo(
    () => entries.filter((e) => e.source === "infrastructure").slice(-MAX_VISIBLE),
    [entries],
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [infraEntries.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  const isConnected = connectionStatus === "connected";

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Badge size="sm" variant={isConnected ? "success" : "danger"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            {infraEntries.length} infra events
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 scrollbar-thin"
      >
        {infraEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--color-text-muted)]">
              {isConnected
                ? "No infrastructure events yet — waiting for autoscaling, provisioning activity..."
                : "Not connected to activity stream"}
            </p>
          </div>
        ) : (
          <div className="py-0.5">
            {infraEntries.map((entry, idx) => (
              <InfraLogRow key={`${entry.timestamp}-${idx}`} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row
   -------------------------------------------------------------------------- */

function InfraLogRow({ entry }: { entry: ActivityLogEntry }) {
  return (
    <div
      className={cn(
        "flex items-center gap-[var(--spacing-2)] px-[var(--spacing-2)] py-0.5 font-mono text-xs leading-5",
        "border-l-2",
        entry.level === "error" && "border-l-[var(--color-action-danger)]",
        entry.level === "warn" && "border-l-[var(--color-action-warning)]",
        entry.level === "info" && "border-l-[var(--color-action-primary)]",
        entry.level === "debug" && "border-l-[var(--color-border-default)]",
      )}
    >
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
        {formatLogTime(entry.timestamp)}
      </span>
      <Badge size="sm" variant={LEVEL_BADGE_VARIANT[entry.level]} className="min-w-[3.25rem] justify-center">
        {LEVEL_LABELS[entry.level]}
      </Badge>
      <span className="text-[var(--color-text-primary)] break-words min-w-0">
        {entry.message}
      </span>
    </div>
  );
}
