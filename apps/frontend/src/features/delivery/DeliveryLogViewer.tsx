/**
 * Delivery log viewer component (PRD-39 Amendment A.3).
 *
 * Displays delivery log entries in a terminal-style viewer matching
 * the generation log style (dark background, monospace LogLine entries).
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/primitives";
import { LogLine } from "@/components/domain";
import type { LogLevel } from "@/components/domain";
import { ChevronDown, ChevronRight, Terminal } from "@/tokens/icons";

import { useDeliveryLogs } from "./hooks/use-delivery-logs";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

type LogFilter = "all" | "error" | "warning";

const FILTER_OPTIONS: { value: LogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface DeliveryLogViewerProps {
  projectId: number;
  /** Poll for new logs (e.g. while an export is in progress). */
  poll?: boolean;
}

export function DeliveryLogViewer({ projectId, poll }: DeliveryLogViewerProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [collapsed, setCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const levelParam = filter === "all" ? undefined : filter;
  const { data: logs = [] } = useDeliveryLogs(projectId, levelParam, 200, poll);

  const hasLogs = logs.length > 0;

  // Auto-expand when polling starts (export in progress).
  useEffect(() => {
    if (poll) setCollapsed(false);
  }, [poll]);

  // Track scroll position for auto-scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when new entries arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  /** Map delivery log level to LogLine level. */
  function toLogLevel(level: string): LogLevel {
    if (level === "error") return "error";
    if (level === "warning") return "warn";
    return "info";
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
          Delivery Logs
        </span>
        {hasLogs && (
          <span className="text-xs text-[var(--color-text-muted)]">
            ({logs.length})
          </span>
        )}

        {/* Live indicator + filter buttons */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <span className="ml-auto flex items-center gap-[var(--spacing-2)]" onClick={(e) => e.stopPropagation()}>
          {poll && (
            <span className="flex items-center gap-[var(--spacing-1)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-action-success)] animate-pulse" />
              <span className="text-xs text-[var(--color-text-muted)]">Live</span>
            </span>
          )}
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </span>
      </div>

      {/* Log output area */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto bg-[var(--color-surface-primary)] p-[var(--spacing-3)]"
        >
          {hasLogs ? (
            <div className="flex flex-col gap-px">
              {logs.map((log) => (
                <LogLine
                  key={log.id}
                  timestamp={log.created_at}
                  level={toLogLevel(log.log_level)}
                  message={log.message}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              No delivery logs yet.
            </p>
          )}

          {/* Blinking cursor when live */}
          {poll && (
            <span className="inline-block mt-1 h-3.5 w-1.5 bg-[var(--color-text-muted)] animate-[blink_1s_steps(1)_infinite]" />
          )}
        </div>
      )}

      {poll && (
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
