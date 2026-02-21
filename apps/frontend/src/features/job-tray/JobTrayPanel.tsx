/**
 * Expandable dropdown panel showing per-job details.
 *
 * Renders as a positioned dropdown anchored to the tray icon.
 * Each job row shows name, progress bar, elapsed time, and quick actions.
 */

import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { Clock, Pause, Square, X } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import type { RefObject } from "react";
import { useCallback } from "react";
import { Badge, Button } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { JobDetail, JobSummary } from "./useJobStatusAggregator";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface JobTrayPanelProps {
  summary: JobSummary;
  onClose: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 w-full rounded-[var(--radius-full)] bg-[var(--color-surface-tertiary)]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-[var(--radius-full)]",
          "bg-[var(--color-action-primary)]",
          "transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-default)]",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function JobRow({ job }: { job: JobDetail }) {
  const isRunning = job.status === "running";
  const remaining = job.estimatedRemainingMs
    ? formatDuration(job.estimatedRemainingMs)
    : undefined;

  return (
    <div
      className={cn(
        "px-3 py-2.5",
        "border-b border-[var(--color-border-default)] last:border-b-0",
        "hover:bg-[var(--color-surface-tertiary)]/50",
        "transition-colors duration-[var(--duration-instant)]",
      )}
    >
      <Stack direction="vertical" gap={2}>
        {/* Header row: name + status badge */}
        <Stack direction="horizontal" gap={2} align="center" justify="between">
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[200px]">
            {job.name}
          </span>
          <Badge
            variant={isRunning ? "info" : "default"}
            size="sm"
          >
            {job.status}
          </Badge>
        </Stack>

        {/* Progress bar (running jobs only) */}
        {isRunning && (
          <Stack direction="vertical" gap={1}>
            <ProgressBar value={job.progress} />
            <Stack direction="horizontal" gap={2} align="center" justify="between">
              <span className="text-xs text-[var(--color-text-muted)]">
                {job.progress}%
              </span>
              <Stack direction="horizontal" gap={1} align="center">
                <Clock size={iconSizes.sm} className="text-[var(--color-text-muted)]" />
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatDuration(job.elapsedMs)}
                  {remaining && ` — ~${remaining} left`}
                </span>
              </Stack>
            </Stack>
          </Stack>
        )}

        {/* Queued jobs show position only */}
        {job.status === "queued" && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Waiting in queue...
          </span>
        )}

        {/* Quick actions */}
        <Stack direction="horizontal" gap={1} align="center" justify="end">
          {isRunning && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Pause size={iconSizes.sm} />}
              aria-label={`Pause ${job.name}`}
            >
              Pause
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Square size={iconSizes.sm} />}
            aria-label={`Cancel ${job.name}`}
          >
            Cancel
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main panel
   -------------------------------------------------------------------------- */

export function JobTrayPanel({ summary, onClose, containerRef }: JobTrayPanelProps) {
  /* -- Close on outside click ------------------------------------------- */
  useClickOutside(containerRef, onClose);

  /* -- Close on Escape -------------------------------------------------- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const hasJobs = summary.jobs.length > 0;

  return (
    <div
      role="dialog"
      aria-label="Active jobs"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        "absolute right-0 top-full mt-2 z-50",
        "w-80 max-h-96 overflow-auto",
        "bg-[var(--color-surface-secondary)]",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
    >
      {/* Panel header */}
      <div
        className={cn(
          "flex items-center justify-between",
          "px-3 py-2.5",
          "border-b border-[var(--color-border-default)]",
        )}
      >
        <Stack direction="horizontal" gap={2} align="center">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Active Jobs
          </span>
          {hasJobs && (
            <Badge variant="info" size="sm">
              {summary.runningCount + summary.queuedCount}
            </Badge>
          )}
        </Stack>

        <button
          type="button"
          onClick={onClose}
          className={cn(
            "p-1 rounded-[var(--radius-sm)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "hover:bg-[var(--color-surface-tertiary)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
          aria-label="Close panel"
        >
          <X size={iconSizes.sm} aria-hidden="true" />
        </button>
      </div>

      {/* Job list */}
      {hasJobs ? (
        <div>
          {summary.jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <span className="text-sm text-[var(--color-text-muted)]">
            No active jobs
          </span>
        </div>
      )}

      {/* Footer with overall progress */}
      {hasJobs && (
        <div
          className={cn(
            "px-3 py-2",
            "border-t border-[var(--color-border-default)]",
            "bg-[var(--color-surface-primary)]/50",
          )}
        >
          <Stack direction="horizontal" gap={2} align="center" justify="between">
            <span className="text-xs text-[var(--color-text-muted)]">
              Overall progress
            </span>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {summary.overallProgress}%
            </span>
          </Stack>
          <div className="mt-1">
            <ProgressBar value={summary.overallProgress} />
          </div>
        </div>
      )}
    </div>
  );
}
