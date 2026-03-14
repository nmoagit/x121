/**
 * Terminal-style log viewer for the video generation pipeline.
 *
 * Shows real-time generation log entries in a dark, monospace console.
 * Polls for new entries every 2 seconds while generation is active.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/primitives";
import { LogLine } from "@/components/domain";
import { ChevronDown, ChevronRight, Terminal, Trash2, XCircle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useGenerationLog, useCancelGeneration, useClearGenerationLog } from "./hooks/use-generation";

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
  const [collapsed, setCollapsed] = useState(!isGenerating);

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

  // Auto-expand when generation starts.
  useEffect(() => {
    if (isGenerating) setCollapsed(false);
  }, [isGenerating]);

  const hasEntries = entries && entries.length > 0;

  if (!hasEntries && !isGenerating) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden">
      {/* Terminal header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCollapsed((v) => !v); }}
        className="flex w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-tertiary)] border-b border-[var(--color-border-default)] cursor-pointer hover:bg-[var(--color-surface-secondary)] transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
        ) : (
          <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        )}
        <Terminal size={14} className="text-[var(--color-text-muted)]" />
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Generation Log
        </span>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <span className="ml-auto flex items-center gap-[var(--spacing-2)]" onClick={(e) => e.stopPropagation()}>
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
      {!collapsed && (
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto bg-[#0d1117] p-[var(--spacing-3)]"
      >
        {hasEntries ? (
          <div className="flex flex-col gap-px">
            {entries.map((entry) => (
              <LogLine
                key={entry.id}
                timestamp={entry.created_at}
                level={entry.level}
                message={entry.message}
              />
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
      )}

      {/* Inline keyframes for the blinking cursor */}
      {isGenerating && (
        <style>{`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      )}
    </div>
  );
}

