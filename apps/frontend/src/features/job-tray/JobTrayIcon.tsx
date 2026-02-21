/**
 * Compact tray icon for the navigation bar.
 *
 * Displays running/queued job counts as a badge, an animated spinner
 * while jobs are running, and toggles the expandable JobTrayPanel.
 */

import { cn } from "@/lib/cn";
import { Activity, Layers } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { useCallback, useRef, useState } from "react";
import { Tooltip } from "@/components/primitives";
import { JobTrayPanel } from "./JobTrayPanel";
import { useJobStatusAggregator, useJobStatusConnector } from "./useJobStatusAggregator";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ICON_SIZE = iconSizes.md;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JobTrayIcon() {
  useJobStatusConnector();
  const summary = useJobStatusAggregator();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const isRunning = summary.runningCount > 0;
  const isIdle = summary.runningCount === 0 && summary.queuedCount === 0;
  const totalActive = summary.runningCount + summary.queuedCount;

  const tooltipText = isIdle
    ? "No active jobs"
    : `${summary.runningCount} running, ${summary.queuedCount} queued — ${summary.overallProgress}%`;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Tooltip content={tooltipText} side="bottom">
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Job tray: ${tooltipText}`}
          className={cn(
            "relative inline-flex items-center justify-center",
            "w-9 h-9 rounded-[var(--radius-md)]",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
            "hover:bg-[var(--color-surface-tertiary)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
            isRunning && "text-[var(--color-action-primary)]",
            isIdle && "text-[var(--color-text-muted)]",
            !isIdle && !isRunning && "text-[var(--color-text-secondary)]",
          )}
        >
          {isRunning ? (
            <Activity size={ICON_SIZE} className="animate-pulse" aria-hidden="true" />
          ) : (
            <Layers size={ICON_SIZE} aria-hidden="true" />
          )}

          {totalActive > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5",
                "flex items-center justify-center",
                "min-w-[18px] h-[18px] px-1",
                "text-[10px] font-bold leading-none",
                "rounded-[var(--radius-full)]",
                "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]",
              )}
            >
              {totalActive}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <JobTrayPanel
          summary={summary}
          onClose={close}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}
