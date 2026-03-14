/**
 * Shared log line component for terminal-style log viewers.
 *
 * Renders a single log entry with timestamp, level badge, and message
 * in a monospace terminal style. Used by GenerationTerminal (per-scene)
 * and GenerationLogTab (global activity console).
 */

import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatLogTime } from "@/features/activity-console";

/* --------------------------------------------------------------------------
   Level type and constants
   -------------------------------------------------------------------------- */

/** Log levels used by generation logs (superset includes "success"). */
export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export const LOG_LEVEL_BADGE_VARIANT: Record<LogLevel, BadgeVariant> = {
  debug: "default",
  info: "default",
  warn: "warning",
  error: "danger",
  success: "success",
};

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERR",
  success: "OK",
};

const LEVEL_MESSAGE_CLASSES: Record<LogLevel, string> = {
  debug: "text-[var(--color-text-muted)]",
  info: "text-[var(--color-text-muted)]",
  warn: "text-[var(--color-action-warning)]",
  error: "text-[var(--color-action-danger)]",
  success: "text-[var(--color-action-success)]",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface LogLineProps {
  /** ISO timestamp for the entry. */
  timestamp: string;
  /** Log level — determines badge variant and message color. */
  level: LogLevel;
  /** The log message text. */
  message: string;
  /** Optional prefix shown between badge and message (e.g. scene ID). */
  prefix?: React.ReactNode;
}

export function LogLine({ timestamp, level, message, prefix }: LogLineProps) {
  return (
    <div className="flex items-center gap-[var(--spacing-2)] font-mono text-xs leading-5">
      <span className="shrink-0 text-[var(--color-text-muted)] opacity-60">
        {formatLogTime(timestamp)}
      </span>
      <Badge
        size="sm"
        variant={LOG_LEVEL_BADGE_VARIANT[level]}
        className="min-w-[3.25rem] justify-center"
      >
        {LOG_LEVEL_LABELS[level]}
      </Badge>
      {prefix}
      <span className={cn("break-words min-w-0", LEVEL_MESSAGE_CLASSES[level])}>
        {message}
      </span>
    </div>
  );
}
