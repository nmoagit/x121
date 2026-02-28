/**
 * Tooltip content for hovering over a job block in the Gantt timeline (PRD-90).
 *
 * Shows: job ID, worker, status, priority, type, progress, start/end times.
 */

import { priorityLabel } from "@/features/queue";
import { formatDateTime } from "@/lib/format";

import type { TimelineJob } from "./types";
import { resolveJobStatus } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface JobBlockTooltipProps {
  job: TimelineJob;
}

export function JobBlockTooltip({ job }: JobBlockTooltipProps) {
  const status = resolveJobStatus(job.status_id);

  return (
    <div className="flex flex-col gap-1 text-xs min-w-[180px]">
      <div className="font-semibold text-[var(--color-text-primary)]">Job #{job.job_id}</div>

      {job.worker_name && <Row label="Worker" value={job.worker_name} />}

      <Row label="Type" value={job.job_type} />
      <Row label="Status" value={status} />
      <Row label="Priority" value={priorityLabel(job.priority)} />
      <Row label="Progress" value={`${job.progress_percent}%`} />

      <Row label="Start" value={formatDateTime(job.start)} />
      <Row label="End" value={formatDateTime(job.end)} />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal helper
   -------------------------------------------------------------------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text-primary)] text-right">{value}</span>
    </div>
  );
}
