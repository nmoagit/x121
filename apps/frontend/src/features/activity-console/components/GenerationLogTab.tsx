/**
 * Generation log tab for the activity console.
 *
 * Polls the global `/generation-logs` endpoint to show the same entries
 * that appear in per-scene GenerationTerminal panels, but across all scenes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/primitives";
import { ArrowDown } from "@/tokens/icons";
import { api } from "@/lib/api";
import { LogLine } from "@/components/domain";
import { TERMINAL_HEADER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import type { GenerationLogEntry } from "@/features/generation/types";

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

  // Use the latest entry's ID as the trigger — more reliable than length
  // (length stays the same when old entries drop off and new ones arrive).
  const latestId = chronological.length > 0 ? chronological[chronological.length - 1]!.id : null;

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [latestId, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

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
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
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
            <p className="font-mono text-xs text-[var(--color-text-muted)]">Loading...</p>
          </div>
        ) : chronological.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              No generation log entries yet
            </p>
          </div>
        ) : (
          <div className="p-[var(--spacing-3)] space-y-px">
            {chronological.map((entry) => (
              <LogLine
                key={entry.id}
                timestamp={entry.created_at}
                level={entry.level}
                message={entry.message}
                prefix={
                  <span className="shrink-0 text-cyan-400 opacity-70 font-mono text-[10px]">
                    S{entry.scene_id}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Jump to latest */}
      {!autoScroll && chronological.length > 0 && (
        <div className="absolute bottom-[var(--spacing-4)] right-[var(--spacing-4)]">
          <Button variant="secondary" size="xs" onClick={jumpToBottom} icon={<ArrowDown size={12} />} className="shadow-md">
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
