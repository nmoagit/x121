/**
 * Shared log line component for terminal-style log viewers.
 *
 * Renders a single log entry with timestamp, colored level label, and message
 * in a monospace terminal style. Used by GenerationTerminal (per-scene),
 * GenerationLogTab (global activity console), and delivery logs.
 */

import { cn } from "@/lib/cn";
import { formatLogTime } from "@/features/activity-console";

/* --------------------------------------------------------------------------
   Level type and constants
   -------------------------------------------------------------------------- */

/** Log levels used by generation logs (superset includes "success"). */
export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
  success: "OK",
};

const LEVEL_LABEL_COLORS: Record<LogLevel, string> = {
  debug: "text-[var(--color-text-muted)]",
  info: "text-[var(--color-data-cyan)]",
  warn: "text-[var(--color-data-orange)]",
  error: "text-[var(--color-data-red)]",
  success: "text-[var(--color-data-green)]",
};

const LEVEL_MESSAGE_COLORS: Record<LogLevel, string> = {
  debug: "text-[var(--color-text-muted)]",
  info: "text-[var(--color-text-muted)]",
  warn: "text-[var(--color-data-orange)]",
  error: "text-[var(--color-data-red)]",
  success: "text-[var(--color-data-green)]",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LogLineProps {
  /** ISO timestamp for the entry. */
  timestamp: string;
  /** Log level — determines label color and message color. */
  level: LogLevel;
  /** The log message text. */
  message: string;
  /** Optional prefix shown between level and message (e.g. scene ID). */
  prefix?: React.ReactNode;
}

export function LogLine({ timestamp, level, message, prefix }: LogLineProps) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] leading-5">
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-40 text-[10px]">
        {formatLogTime(timestamp)}
      </span>
      <span className={cn("shrink-0 w-7 text-[10px] font-semibold uppercase", LEVEL_LABEL_COLORS[level])}>
        {LOG_LEVEL_LABELS[level]}
      </span>
      {prefix}
      <span className={cn("break-words min-w-0", LEVEL_MESSAGE_COLORS[level])}>
        {message}
      </span>
    </div>
  );
}
