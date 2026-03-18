import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { useActiveTasks, useScheduledGenerationsWidget } from "@/features/dashboard/hooks/use-dashboard";
import type { ActiveTaskItem } from "@/features/dashboard/hooks/use-dashboard";
import { filterActiveGenerationSchedules } from "@/features/job-scheduling/types";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatDurationSecs } from "@/lib/format";
import { Activity, Layers } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const STATUS_BADGE_MAP: Record<string, BadgeVariant> = {
  running: "info",
  pending: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "default",
  retrying: "warning",
};

function statusVariant(status: string): BadgeVariant {
  return STATUS_BADGE_MAP[status] ?? "default";
}

const formatElapsed = formatDurationSecs;

/* --------------------------------------------------------------------------
   Task row
   -------------------------------------------------------------------------- */

/** Build a human-readable task label from enriched scene context fields. */
function taskLabel(task: ActiveTaskItem): string {
  // When we have scene context, show "Model — Scene Type / Track"
  if (task.character_name) {
    const parts = [task.character_name];
    if (task.scene_type_name) {
      parts.push(task.scene_type_name);
    }
    if (task.track_name) {
      parts.push(task.track_name);
    }
    return parts.join(" \u2014 ");
  }
  // Fallback: humanise the raw job_type (e.g. "segment_generation" → "Segment Generation")
  return task.job_type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TaskRow({ task }: { task: ActiveTaskItem }) {
  return (
    <div className="flex items-center justify-between gap-[var(--spacing-2)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
          {taskLabel(task)}
        </p>
        {task.progress_message && (
          <p className="text-xs text-[var(--color-text-muted)] truncate">{task.progress_message}</p>
        )}
      </div>

      <div className="flex items-center gap-[var(--spacing-2)] shrink-0">
        {/* Progress bar for running jobs */}
        {task.status === "running" && (
          <div className="w-16 h-1.5 rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
              style={{ width: `${Math.min(task.progress_pct, 100)}%` }}
            />
          </div>
        )}

        <span className="text-xs text-[var(--color-text-muted)] tabular-nums w-14 text-right">
          {task.status === "running" ? `${task.progress_pct}%` : formatElapsed(task.elapsed_seconds)}
        </span>

        <Badge variant={statusVariant(task.status)} size="sm">
          {task.status}
        </Badge>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Summary bar
   -------------------------------------------------------------------------- */

function SummaryBar({ tasks, scheduledCount }: { tasks: ActiveTaskItem[]; scheduledCount: number }) {
  const running = tasks.filter((t) => t.status === "running").length;
  const queued = tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="flex items-center gap-3 pb-2 mb-2 border-b border-[var(--color-border-default)] text-xs">
      <span className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-[var(--color-action-primary)]" />
        <span className="text-[var(--color-text-secondary)]">Running: <strong>{running}</strong></span>
      </span>
      <span className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-[var(--color-action-warning)]" />
        <span className="text-[var(--color-text-secondary)]">Queued: <strong>{queued}</strong></span>
      </span>
      <span className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-[var(--color-status-info)]" />
        <span className="text-[var(--color-text-secondary)]">Scheduled: <strong>{scheduledCount}</strong></span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ActiveTasksWidget() {
  const { data: tasks, isLoading, error, refetch } = useActiveTasks();
  const { data: schedules } = useScheduledGenerationsWidget();

  const scheduledCount = filterActiveGenerationSchedules(schedules ?? []).length;

  return (
    <WidgetBase
      title="Active Tasks"
      icon={<Activity size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        <Link to="/admin/queue" className="text-xs text-[var(--color-action-primary)] hover:underline">
          Queue
        </Link>
      }
    >
      {!tasks || tasks.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No active tasks"
          description="All jobs are idle. Submit a new job to see it here."
        />
      ) : (
        <div className="flex flex-col">
          <SummaryBar tasks={tasks} scheduledCount={scheduledCount} />
          {tasks.map((task) => (
            <TaskRow key={task.job_id} task={task} />
          ))}
        </div>
      )}
    </WidgetBase>
  );
}
