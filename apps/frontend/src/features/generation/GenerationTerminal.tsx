/**
 * Terminal-style log viewer for the video generation pipeline.
 *
 * Shows real-time generation log entries in a dark, monospace console.
 * Polls for new entries every 2 seconds while generation is active.
 */

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/primitives";
import { Terminal, Trash2, XCircle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatLogTime } from "@/features/activity-console";

import { useGenerationLog, useCancelGeneration, useClearGenerationLog } from "./hooks/use-generation";
import type { GenerationLogEntry } from "./types";

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
  error: "ERR ",
  success: " OK ",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface GenerationTerminalProps {
  sceneId: number;
  isGenerating: boolean;
}

export function GenerationTerminal({
  sceneId,
  isGenerating,
}: GenerationTerminalProps) {
  const { data: entries } = useGenerationLog(sceneId, isGenerating);
  const cancelGeneration = useCancelGeneration(sceneId);
  const clearLog = useClearGenerationLog(sceneId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Track whether the user is scrolled to the bottom so we can auto-scroll
  // only when they haven't scrolled up to read older entries.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const threshold = 24;
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom when new entries arrive (if user is at bottom).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const hasEntries = entries && entries.length > 0;

  if (!hasEntries && !isGenerating) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-tertiary)] border-b border-[var(--color-border-default)]">
        <Terminal size={14} className="text-[var(--color-text-muted)]" />
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Generation Log
        </span>
        <span className="ml-auto flex items-center gap-[var(--spacing-2)]">
          {isGenerating ? (
            <>
              <span className="flex items-center gap-[var(--spacing-1)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-action-success)] animate-pulse" />
                <span className="text-xs text-[var(--color-text-muted)]">Live</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<XCircle size={iconSizes.sm} />}
                onClick={() => cancelGeneration.mutate()}
                disabled={cancelGeneration.isPending}
              >
                Cancel
              </Button>
            </>
          ) : hasEntries ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={() => clearLog.mutate()}
              disabled={clearLog.isPending}
            >
              Clear
            </Button>
          ) : null}
        </span>
      </div>

      {/* Log output area */}
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto bg-[#0d1117] p-[var(--spacing-3)]"
      >
        {hasEntries ? (
          <div className="flex flex-col gap-px">
            {entries.map((entry) => (
              <LogLine key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)] font-mono">
            Waiting for generation to start...
          </p>
        )}

        {/* Blinking cursor when generating */}
        {isGenerating && (
          <span className="inline-block mt-1 h-3.5 w-1.5 bg-[var(--color-text-muted)] animate-[blink_1s_steps(1)_infinite]" />
        )}
      </div>

      {/* Inline keyframes for the blinking cursor */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------------------
   LogLine — a single log entry
   -------------------------------------------------------------------------- */

function LogLine({ entry }: { entry: GenerationLogEntry }) {
  return (
    <div className="flex gap-[var(--spacing-2)] font-mono text-xs leading-5">
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
        {formatLogTime(entry.created_at)}
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold",
          LEVEL_CLASSES[entry.level],
        )}
      >
        [{LEVEL_LABELS[entry.level]}]
      </span>
      <span
        className={cn(
          "break-words min-w-0",
          entry.level === "error"
            ? "text-[var(--color-action-danger)]"
            : "text-[var(--color-text-secondary)]",
        )}
      >
        {entry.message}
      </span>
    </div>
  );
}
