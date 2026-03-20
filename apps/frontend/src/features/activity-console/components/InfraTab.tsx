/**
 * Infrastructure tab for the activity console.
 *
 * Shows only infrastructure-source activity (autoscaling, provisioning,
 * instance lifecycle) from the live WebSocket stream, filtered to remove
 * all other noise.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/primitives";
import { ArrowDown } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import {
  TERMINAL_HEADER,
  TERMINAL_ROW_HOVER,
} from "@/lib/ui-classes";

import { useActivityLogStream } from "../hooks/useActivityLogStream";
import { useActivityConsoleStore } from "../stores/useActivityConsoleStore";
import type { ActivityLogEntry } from "../types";
import { formatLogTime, LEVEL_LABELS, LEVEL_TERMINAL_COLORS } from "../types";

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

  const jumpToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  return (
    <div className="relative flex flex-col h-full bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className={cn("font-mono text-[10px] uppercase tracking-wide", isConnected ? "text-green-400" : "text-red-400")}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <span className="opacity-30">|</span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {infraEntries.length} infra events
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 bg-[#0d1117] scrollbar-thin"
      >
        {infraEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {isConnected
                ? "No infrastructure events yet \u2014 waiting for autoscaling, provisioning activity..."
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

      {/* Jump to latest */}
      {!autoScroll && infraEntries.length > 0 && (
        <div className="absolute bottom-[var(--spacing-4)] right-[var(--spacing-4)]">
          <Button variant="secondary" size="xs" onClick={jumpToBottom} icon={<ArrowDown size={12} />} className="shadow-md">
            Jump to latest
          </Button>
        </div>
      )}
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
      <span className="text-[var(--color-text-primary)] break-words min-w-0">
        {entry.message}
      </span>
    </div>
  );
}
