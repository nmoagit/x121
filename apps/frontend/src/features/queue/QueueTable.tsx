/**
 * Queue jobs table with live timers and status badges (PRD-132).
 *
 * Displays all job states in a scrollable table. Running jobs show a
 * live elapsed timer. Failed jobs show error on hover via Tooltip.
 */

import { useEffect, useState } from "react";

import { Badge, Checkbox, Spinner, Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration } from "@/lib/format";

import { useAdminQueueJobs } from "./hooks/use-queue";
import { JobActionMenu } from "./JobActions";
import type { FullQueueJob, QueueJobFilter } from "./types";
import { statusLabel, statusColor, priorityLabel, JOB_STATUS_RUNNING } from "./types";

/* --------------------------------------------------------------------------
   Live timer for running jobs
   -------------------------------------------------------------------------- */

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Date.now() - new Date(startedAt).getTime(),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <span className="font-mono text-xs text-[var(--color-status-info)]">
      {formatDuration(elapsed)}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Duration cell
   -------------------------------------------------------------------------- */

function DurationCell({ job }: { job: FullQueueJob }) {
  if (job.status_id === JOB_STATUS_RUNNING && job.started_at) {
    return <LiveTimer startedAt={job.started_at} />;
  }
  if (job.actual_duration_secs != null) {
    return (
      <span className="text-xs text-[var(--color-text-muted)]">
        {formatDuration(job.actual_duration_secs * 1000)}
      </span>
    );
  }
  return <span className="text-xs text-[var(--color-text-muted)]">--</span>;
}

/* --------------------------------------------------------------------------
   Table row
   -------------------------------------------------------------------------- */

interface JobRowProps {
  job: FullQueueJob;
  selected: boolean;
  onToggle: (id: number) => void;
}

function JobRow({ job, selected, onToggle }: JobRowProps) {
  const label = statusLabel(job.status_id);
  const variant = statusColor(job.status_id);

  const errorContent = job.error_message ? (
    <Tooltip content={job.error_message} side="left">
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    </Tooltip>
  ) : (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );

  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border-default)] last:border-b-0",
        "hover:bg-[var(--color-surface-tertiary)]/50 transition-colors",
        selected && "bg-[var(--color-action-primary)]/5",
      )}
    >
      <td className="px-3 py-2">
        <Checkbox checked={selected} onChange={() => onToggle(job.id)} />
      </td>
      <td className="px-3 py-2 text-xs font-mono text-[var(--color-text-muted)]">
        #{job.id}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        {job.job_type}
      </td>
      <td className="px-3 py-2">{errorContent}</td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
        {priorityLabel(job.priority)}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
        {job.comfyui_instance_id ?? "--"}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
        {formatDateTime(job.submitted_at)}
      </td>
      <td className="px-3 py-2">
        <DurationCell job={job} />
      </td>
      <td className="px-3 py-2">
        <JobActionMenu job={job} />
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Sort header
   -------------------------------------------------------------------------- */

interface SortHeaderProps {
  label: string;
  field: string;
  filter: QueueJobFilter;
  onChange: (filter: QueueJobFilter) => void;
}

function SortHeader({ label, field, filter, onChange }: SortHeaderProps) {
  const isActive = filter.sort_by === field;
  const dir = isActive ? filter.sort_dir : undefined;

  const handleClick = () => {
    if (!isActive) {
      onChange({ ...filter, sort_by: field, sort_dir: "desc" });
    } else if (dir === "desc") {
      onChange({ ...filter, sort_by: field, sort_dir: "asc" });
    } else {
      onChange({ ...filter, sort_by: undefined, sort_dir: undefined });
    }
  };

  return (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text-primary)]"
      onClick={handleClick}
    >
      {label}
      {isActive && (
        <span className="ml-1">{dir === "asc" ? "\u2191" : "\u2193"}</span>
      )}
    </th>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface QueueTableProps {
  filter: QueueJobFilter;
  onFilterChange: (filter: QueueJobFilter) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
}

export function QueueTable({
  filter,
  onFilterChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: QueueTableProps) {
  const { data: jobs, isLoading } = useAdminQueueJobs(filter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        No jobs match the current filters
      </div>
    );
  }

  const allSelected = jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id));
  const someSelected = jobs.some((j) => selectedIds.has(j.id)) && !allSelected;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-[var(--color-surface-primary)]/50 border-b border-[var(--color-border-default)]">
          <tr>
            <th className="px-3 py-2 w-8">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() =>
                  allSelected
                    ? onSelectAll([])
                    : onSelectAll(jobs.map((j) => j.id))
                }
              />
            </th>
            <SortHeader label="ID" field="id" filter={filter} onChange={onFilterChange} />
            <SortHeader label="Type" field="job_type" filter={filter} onChange={onFilterChange} />
            <SortHeader label="Status" field="status_id" filter={filter} onChange={onFilterChange} />
            <SortHeader label="Priority" field="priority" filter={filter} onChange={onFilterChange} />
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Worker
            </th>
            <SortHeader label="Submitted" field="submitted_at" filter={filter} onChange={onFilterChange} />
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Duration
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              selected={selectedIds.has(job.id)}
              onToggle={onToggleSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
