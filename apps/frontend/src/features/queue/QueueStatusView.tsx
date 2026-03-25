/**
 * Queue status overview panel (PRD-08).
 *
 * Displays current queue state: total counts, ordered job list with
 * priority indicators, and estimated wait time.
 */

import { cn } from "@/lib/cn";
import { Clock, Pause, Play, XCircle } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { Button ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";

import { useQueueStatus, usePauseJob, useResumeJob, useCancelJob } from "./hooks/use-queue";
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
  const cancelJob = useCancelJob();

  return (
    <div
      className={cn(
        "px-3 py-2.5",
        TERMINAL_DIVIDER,
        "last:border-b-0",
        TERMINAL_ROW_HOVER,
        "transition-colors",
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
            <span className="font-mono text-xs text-[var(--color-text-primary)] truncate max-w-[180px]">
              {job.job_type}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
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
            <span className="font-mono text-[10px] uppercase text-orange-400">PAUSED</span>
          ) : null}
          {job.is_paused ? (
            <Button
              variant="ghost"
              size="xs"
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
              size="xs"
              icon={<Pause size={iconSizes.sm} />}
              aria-label={`Pause ${job.job_type}`}
              onClick={() => pauseJob.mutate(job.id)}
              disabled={pauseJob.isPending}
            >
              Pause
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            icon={<XCircle size={iconSizes.sm} />}
            aria-label={`Cancel ${job.job_type}`}
            onClick={() => cancelJob.mutate(job.id)}
            disabled={cancelJob.isPending}
          >
            Cancel
          </Button>
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
        <ContextLoader size={48} />
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
    <div className={TERMINAL_PANEL}>
      {/* Header with counts */}
      <div className={TERMINAL_HEADER}>
        <Stack direction="horizontal" gap={4} align="center" justify="between">
          <span className={TERMINAL_HEADER_TITLE}>
            Job Queue
          </span>
          <span className="font-mono text-xs flex items-center gap-0">
            <span className="text-cyan-400">{data.total_queued} queued</span>
            <span className={`mx-2 ${TERMINAL_PIPE}`}>|</span>
            <span className="text-green-400">{data.total_running} running</span>
            {data.total_scheduled > 0 && (
              <>
                <span className={`mx-2 ${TERMINAL_PIPE}`}>|</span>
                <span className="text-[var(--color-text-muted)]">{data.total_scheduled} scheduled</span>
              </>
            )}
          </span>
        </Stack>

        {/* Estimated wait */}
        {data.estimated_wait_secs != null && data.estimated_wait_secs > 0 && (
          <Stack direction="horizontal" gap={1} align="center" className="mt-1">
            <Clock
              size={iconSizes.sm}
              className="text-[var(--color-text-muted)]"
            />
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              ETA: {formatWait(data.estimated_wait_secs)}
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
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            Queue is empty
          </span>
        </div>
      )}
    </div>
  );
}
