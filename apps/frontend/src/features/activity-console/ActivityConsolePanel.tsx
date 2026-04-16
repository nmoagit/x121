/**
 * Terminal-style console panel for live activity log streaming (PRD-118).
 *
 * Displays a scrollable, auto-following list of log entries with
 * filter toolbar, pause/resume, clear, and connection status.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/primitives";
import { ArrowDown, Pause, Play, Trash2 } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { TERMINAL_HEADER } from "@/lib/ui-classes";

import { ConsoleFilterToolbar } from "./components/ConsoleFilterToolbar";
import { LogEntryRow } from "./components/LogEntryRow";
import { useActivityLogStream } from "./hooks/useActivityLogStream";
import { useActivityConsoleStore } from "./stores/useActivityConsoleStore";
import type { WsConnectionStatus } from "./types";
import { TYPO_DATA_MUTED, TYPO_DATA_WARNING } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CONNECTION_LABELS: Record<WsConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
};

const CONNECTION_COLORS: Record<WsConnectionStatus, string> = {
  connecting: "text-[var(--color-data-orange)]",
  connected: "text-[var(--color-data-green)]",
  disconnected: "text-[var(--color-data-red)]",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityConsolePanel() {
  const connectionStatus = useActivityLogStream();

  const allEntries = useActivityConsoleStore((s) => s.entries);
  const levels = useActivityConsoleStore((s) => s.levels);
  const sources = useActivityConsoleStore((s) => s.sources);
  const isPaused = useActivityConsoleStore((s) => s.isPaused);
  const skippedCount = useActivityConsoleStore((s) => s.skippedCount);
  const setPaused = useActivityConsoleStore((s) => s.setPaused);
  const clearEntries = useActivityConsoleStore((s) => s.clearEntries);

  // Apply level + source filters
  const entries = useMemo(() =>
    allEntries.filter((e) =>
      (levels.size === 0 || levels.has(e.level)) &&
      (sources.size === 0 || sources.has(e.source))
    ),
    [allEntries, levels, sources],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* -- Auto-scroll to bottom when new entries arrive ---------------------- */
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, isAtBottom]);

  /** Handle scroll events to detect whether user is at the bottom. */
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setIsAtBottom(atBottom);
  }, []);

  /** Jump to latest entries. */
  const jumpToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Filter toolbar */}
      <ConsoleFilterToolbar />

      {/* Status bar */}
      <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className={cn("font-mono text-[10px] uppercase tracking-wide", CONNECTION_COLORS[connectionStatus])}>
            {CONNECTION_LABELS[connectionStatus]}
          </span>
          <span className="opacity-30">|</span>
          <span className={TYPO_DATA_MUTED}>
            {entries.length.toLocaleString()} entries
          </span>
          {skippedCount > 0 && (
            <>
              <span className="opacity-30">|</span>
              <span className={TYPO_DATA_WARNING}>
                {skippedCount.toLocaleString()} skipped
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setPaused(!isPaused)}
            icon={isPaused ? <Play size={12} /> : <Pause size={12} />}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={clearEntries}
            icon={<Trash2 size={12} />}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 bg-[var(--color-surface-primary)] scrollbar-thin"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className={TYPO_DATA_MUTED}>
              {connectionStatus === "connected"
                ? "Waiting for log entries..."
                : "Not connected to log stream"}
            </p>
          </div>
        ) : (
          <div className="py-0.5">
            {entries.map((entry, idx) => (
              <LogEntryRow key={`${entry.timestamp}-${idx}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Jump to latest button */}
      {!isAtBottom && entries.length > 0 && (
        <div className="absolute bottom-[var(--spacing-4)] right-[var(--spacing-4)]">
          <Button
            variant="secondary"
            size="xs"
            onClick={jumpToBottom}
            icon={<ArrowDown size={12} />}
            className="shadow-md"
          >
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
