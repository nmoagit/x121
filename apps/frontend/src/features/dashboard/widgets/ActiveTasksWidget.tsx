import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useActiveTasks, useScheduledGenerationsWidget } from "@/features/dashboard/hooks/use-dashboard";
import type { ActiveTaskItem } from "@/features/dashboard/hooks/use-dashboard";
import { filterActiveGenerationSchedules } from "@/features/job-scheduling/types";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatDurationSecs } from "@/lib/format";
import {
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_LABEL,
  TERMINAL_PIPE,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { Activity, Layers } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const formatElapsed = formatDurationSecs;

function statusColor(status: string): string {
  return TERMINAL_STATUS_COLORS[status] ?? "text-[var(--color-text-muted)]";
}

/* --------------------------------------------------------------------------
   Task row
   -------------------------------------------------------------------------- */

/** Build a human-readable task label from enriched scene context fields. */
function taskLabel(task: ActiveTaskItem): string {
  if (task.avatar_name) {
    const parts = [task.avatar_name];
    if (task.scene_type_name) {
      parts.push(task.scene_type_name);
    }
    if (task.track_name) {
      parts.push(task.track_name);
    }
    return parts.join(" \u2014 ");
  }
  return task.job_type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TaskRow({ task }: { task: ActiveTaskItem }) {
  return (
    <div className={`flex items-center justify-between gap-2 py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-[var(--color-text-primary)] truncate">
          {taskLabel(task)}
        </p>
        {task.progress_message && (
          <p className="font-mono text-xs text-[var(--color-text-muted)] truncate">{task.progress_message}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Progress bar for running jobs */}
        {task.status === "running" && (
          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(task.progress_pct, 100)}%` }}
            />
          </div>
        )}

        <span className="font-mono text-xs text-[var(--color-text-muted)] tabular-nums w-14 text-right">
          {task.status === "running" ? `${task.progress_pct}%` : formatElapsed(task.elapsed_seconds)}
        </span>

        <span className={`font-mono text-xs font-medium ${statusColor(task.status)}`}>
          {task.status}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Summary bar
   -------------------------------------------------------------------------- */

function SummaryBar({ tasks, scheduledCount }: { tasks: ActiveTaskItem[]; scheduledCount: number }) {
  const running = tasks.filter((t) => t.status === "running").length;
  const queued = tasks.filter((t) => t.status === "pending").length;

  return (
    <div className={`flex items-center gap-3 pb-2 mb-2 font-mono text-xs ${TERMINAL_DIVIDER}`}>
      <span className="flex items-center gap-1">
        <span className="text-cyan-400 font-bold tabular-nums">{running}</span>
        <span className={TERMINAL_LABEL}>running</span>
      </span>
      <span className={TERMINAL_PIPE}>|</span>
      <span className="flex items-center gap-1">
        <span className="text-orange-400 font-bold tabular-nums">{queued}</span>
        <span className={TERMINAL_LABEL}>queued</span>
      </span>
      <span className={TERMINAL_PIPE}>|</span>
      <span className="flex items-center gap-1">
        <span className="text-[var(--color-text-muted)] font-bold tabular-nums">{scheduledCount}</span>
        <span className={TERMINAL_LABEL}>scheduled</span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ActiveTasksWidget({ pipelineId }: { pipelineId?: number } = {}) {
  const { data: tasks, isLoading, error, refetch } = useActiveTasks(pipelineId);
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
        <Link to="/admin/queue" className="font-mono text-xs text-cyan-400 hover:underline">
          Queue
        </Link>
      }
    >
      {!tasks || tasks.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No active tasks"
          description="All jobs are idle."
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
