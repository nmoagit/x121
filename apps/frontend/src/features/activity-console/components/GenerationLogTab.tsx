/**
 * Generation log tab for the activity console.
 *
 * Polls the global `/generation-logs` endpoint to show the same entries
 * that appear in per-scene GenerationTerminal panels, but across all scenes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatLogTime } from "@/features/activity-console";
import type { GenerationLogEntry } from "@/features/generation/types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const LEVEL_CLASSES: Record<GenerationLogEntry["level"], string> = {
  info: "text-[var(--color-text-muted)]",
  warn: "text-[var(--color-action-warning)]",
  error: "text-[var(--color-action-danger)]",
  success: "text-[var(--color-action-success)]",
};

const LEVEL_LABELS: Record<GenerationLogEntry["level"], string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERR",
  success: "OK",
};

const LEVEL_BADGE: Record<GenerationLogEntry["level"], "default" | "warning" | "danger" | "success"> = {
  info: "default",
  warn: "warning",
  error: "danger",
  success: "success",
};

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

function useGlobalGenerationLogs() {
  return useQuery({
    queryKey: ["generation-logs", "global"],
    queryFn: () =>
      api.get<GenerationLogEntry[]>("/generation-logs?limit=200"),
    refetchInterval: 2000,
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerationLogTab() {
  const { data: entries, isLoading } = useGlobalGenerationLogs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Entries come newest-first from API — reverse for chronological display.
  const chronological = entries ? [...entries].reverse() : [];

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chronological.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
        <span className="text-xs text-[var(--color-text-muted)]">
          {chronological.length} entries (polling every 2s)
        </span>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 bg-[#0d1117] scrollbar-thin"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
          </div>
        ) : chronological.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[var(--color-text-muted)]">
              No generation log entries yet
            </p>
          </div>
        ) : (
          <div className="p-[var(--spacing-3)] space-y-px">
            {chronological.map((entry) => (
              <GenerationLogRow key={entry.id} entry={entry} />
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

function GenerationLogRow({ entry }: { entry: GenerationLogEntry }) {
  return (
    <div className="flex items-center gap-[var(--spacing-2)] font-mono text-xs leading-5">
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
        {formatLogTime(entry.created_at)}
      </span>
      <Badge size="sm" variant={LEVEL_BADGE[entry.level]} className="min-w-[3.25rem] justify-center">
        {LEVEL_LABELS[entry.level]}
      </Badge>
      <span className="shrink-0 text-[var(--color-action-primary)] opacity-70">
        S{entry.scene_id}
      </span>
      <span
        className={cn(
          "break-words min-w-0",
          LEVEL_CLASSES[entry.level],
        )}
      >
        {entry.message}
      </span>
    </div>
  );
}
