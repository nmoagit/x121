/**
 * Queue status overview panel (PRD-08).
 *
 * Displays current queue state: total counts, ordered job list with
 * priority indicators, and estimated wait time.
 */

import { cn } from "@/lib/cn";
import { Clock, Pause, Play } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Badge, Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { useQueueStatus, usePauseJob, useResumeJob } from "./hooks/use-queue";
import { priorityLabel, priorityColor } from "./types";
import type { QueuedJob } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function formatWait(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remaining = secs % 60;
  if (mins < 60) return remaining > 0 ? `${mins}m ${remaining}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function QueueJobRow({ job }: { job: QueuedJob }) {
  const pauseJob = usePauseJob();
  const resumeJob = useResumeJob();

  return (
    <div
      className={cn(
        "px-3 py-2.5",
        "border-b border-[var(--color-border-default)] last:border-b-0",
        "hover:bg-[var(--color-surface-tertiary)]/50",
        "transition-colors duration-[var(--duration-instant)]",
      )}
    >
      <Stack direction="horizontal" gap={3} align="center" justify="between">
        {/* Priority indicator + job info */}
        <Stack direction="horizontal" gap={2} align="center">
          <div
            className="w-2 h-2 rounded-[var(--radius-full)] shrink-0"
            style={{ backgroundColor: priorityColor(job.priority) }}
            title={priorityLabel(job.priority)}
          />
          <Stack direction="vertical" gap={1}>
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[180px]">
              {job.job_type}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {priorityLabel(job.priority)}
              {job.scheduled_start_at && (
                <> &middot; Scheduled {new Date(job.scheduled_start_at).toLocaleTimeString()}</>
              )}
              {job.is_off_peak_only && <> &middot; Off-peak only</>}
            </span>
          </Stack>
        </Stack>

        {/* Actions */}
        <Stack direction="horizontal" gap={1} align="center">
          {job.is_paused ? (
            <Badge variant="warning" size="sm">Paused</Badge>
          ) : null}
          {job.is_paused ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Play size={iconSizes.sm} />}
              aria-label={`Resume ${job.job_type}`}
              onClick={() => resumeJob.mutate(job.id)}
              disabled={resumeJob.isPending}
            >
              Resume
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Pause size={iconSizes.sm} />}
              aria-label={`Pause ${job.job_type}`}
              onClick={() => pauseJob.mutate(job.id)}
              disabled={pauseJob.isPending}
            >
              Pause
            </Button>
          )}
        </Stack>
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function QueueStatusView() {
  const { data, isLoading, isError } = useQueueStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load queue status
      </div>
    );
  }

  const hasJobs = data.jobs.length > 0;

  return (
    <div
      className={cn(
        "bg-[var(--color-surface-secondary)]",
        "border border-[var(--color-border-default)]",
        "rounded-[var(--radius-lg)]",
        "overflow-hidden",
      )}
    >
      {/* Header with counts */}
      <div
        className={cn(
          "px-4 py-3",
          "border-b border-[var(--color-border-default)]",
          "bg-[var(--color-surface-primary)]/50",
        )}
      >
        <Stack direction="horizontal" gap={4} align="center" justify="between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Job Queue
          </span>
          <Stack direction="horizontal" gap={2} align="center">
            <Badge variant="info" size="sm">
              {data.total_queued} queued
            </Badge>
            <Badge variant="default" size="sm">
              {data.total_running} running
            </Badge>
            {data.total_scheduled > 0 && (
              <Badge variant="default" size="sm">
                {data.total_scheduled} scheduled
              </Badge>
            )}
          </Stack>
        </Stack>

        {/* Estimated wait */}
        {data.estimated_wait_secs != null && data.estimated_wait_secs > 0 && (
          <Stack direction="horizontal" gap={1} align="center" className="mt-1">
            <Clock
              size={iconSizes.sm}
              className="text-[var(--color-text-muted)]"
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              Estimated wait: {formatWait(data.estimated_wait_secs)}
            </span>
          </Stack>
        )}
      </div>

      {/* Job list */}
      {hasJobs ? (
        <div className="max-h-80 overflow-y-auto">
          {data.jobs.map((job) => (
            <QueueJobRow key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <span className="text-sm text-[var(--color-text-muted)]">
            Queue is empty
          </span>
        </div>
      )}
    </div>
  );
}
