/**
 * Terminal-style console panel for live activity log streaming (PRD-118).
 *
 * Displays a scrollable, auto-following list of log entries with
 * filter toolbar, pause/resume, clear, and connection status.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { ArrowDown, Pause, Play, Trash2 } from "@/tokens/icons";
import { cn } from "@/lib/cn";

import { ConsoleFilterToolbar } from "./components/ConsoleFilterToolbar";
import { LogEntryRow } from "./components/LogEntryRow";
import { useActivityLogStream } from "./hooks/useActivityLogStream";
import { useActivityConsoleStore } from "./stores/useActivityConsoleStore";
import type { WsConnectionStatus } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CONNECTION_LABELS: Record<WsConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
};

const CONNECTION_VARIANTS: Record<WsConnectionStatus, "warning" | "success" | "danger"> = {
  connecting: "warning",
  connected: "success",
  disconnected: "danger",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityConsolePanel() {
  const connectionStatus = useActivityLogStream();

  const entries = useActivityConsoleStore((s) => s.entries);
  const isPaused = useActivityConsoleStore((s) => s.isPaused);
  const skippedCount = useActivityConsoleStore((s) => s.skippedCount);
  const setPaused = useActivityConsoleStore((s) => s.setPaused);
  const clearEntries = useActivityConsoleStore((s) => s.clearEntries);

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
    <div className="flex flex-col h-full bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] overflow-hidden">
      {/* Filter toolbar */}
      <ConsoleFilterToolbar />

      {/* Status bar */}
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-1)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Badge size="sm" variant={CONNECTION_VARIANTS[connectionStatus]}>
            {CONNECTION_LABELS[connectionStatus]}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            {entries.length.toLocaleString()} entries
          </span>
          {skippedCount > 0 && (
            <span className="text-xs text-[var(--color-action-warning)]">
              ({skippedCount.toLocaleString()} skipped)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPaused(!isPaused)}
            icon={isPaused ? <Play size={14} /> : <Pause size={14} />}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearEntries}
            icon={<Trash2 size={14} />}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--color-text-muted)]">
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
            size="sm"
            onClick={jumpToBottom}
            icon={<ArrowDown size={14} />}
            className={cn(
              "shadow-md",
            )}
          >
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
