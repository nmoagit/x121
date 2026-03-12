/**
 * Queue jobs table with live timers and status badges (PRD-132).
 *
 * Displays all job states in a scrollable table. Running jobs show a
 * live elapsed timer. Failed jobs show error on hover via Tooltip.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Badge, Checkbox, Spinner, Tooltip } from "@/components/primitives";
import { Image, Play } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, formatDurationSecs } from "@/lib/format";

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
        {formatDurationSecs(job.actual_duration_secs)}
      </span>
    );
  }
  return <span className="text-xs text-[var(--color-text-muted)]">--</span>;
}

/* --------------------------------------------------------------------------
   Target cell — adapts based on job_kind
   -------------------------------------------------------------------------- */

function KindIcon({ kind }: { kind: string | null }) {
  if (kind === "image") return <Image size={12} className="shrink-0 text-[var(--color-text-muted)]" />;
  return <Play size={12} className="shrink-0 text-[var(--color-text-muted)]" />;
}

function TargetCell({ job }: { job: FullQueueJob }) {
  if (job.job_kind === "image") {
    const source = job.source_variant_type ?? "?";
    const target = job.target_variant_type ?? "?";
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <KindIcon kind="image" />
        <span className="text-[var(--color-text-muted)]">{source}</span>
        <span className="text-[var(--color-text-muted)]">{"\u2192"}</span>
        <span className="text-[var(--color-text-primary)]">{target}</span>
      </span>
    );
  }

  const scene = job.scene_type_name ?? "--";
  const track = job.track_name;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <KindIcon kind={job.job_kind} />
      <span className="text-[var(--color-text-secondary)]">{scene}</span>
      {track && (
        <span className="text-xs text-[var(--color-text-muted)]">/ {track}</span>
      )}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Table row
   -------------------------------------------------------------------------- */

interface JobRowProps {
  job: FullQueueJob;
  selected: boolean;
  onToggle: (id: number) => void;
  onNavigate: (job: FullQueueJob) => void;
}

function JobRow({ job, selected, onToggle, onNavigate }: JobRowProps) {
  const label = statusLabel(job.status_id);
  const variant = statusColor(job.status_id);
  const canNavigate = job.character_id != null && job.project_id != null;

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
        canNavigate && "cursor-pointer",
      )}
      onClick={() => canNavigate && onNavigate(job)}
    >
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={() => onToggle(job.id)} />
      </td>
      <td className="px-3 py-2 text-xs font-mono text-[var(--color-text-muted)]">
        #{job.id}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        {job.character_name ?? "--"}
      </td>
      <td className="px-3 py-2">
        <TargetCell job={job} />
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
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
  const navigate = useNavigate();

  function handleNavigateToJob(job: FullQueueJob) {
    if (job.project_id == null || job.character_id == null) return;
    if (job.job_kind === "image") {
      navigate({
        to: `/projects/${job.project_id}/characters/${job.character_id}`,
        search: { tab: "overview" },
      });
    } else {
      navigate({
        to: `/projects/${job.project_id}/characters/${job.character_id}`,
        search: { tab: "scenes", scene: String(job.scene_id) },
      });
    }
  }

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
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Character
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Target
            </th>
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
              onNavigate={handleNavigateToJob}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
