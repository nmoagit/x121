import { Badge } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { useActiveTasks } from "@/features/dashboard/hooks/use-dashboard";
import type { ActiveTaskItem } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatDuration } from "@/lib/format";
import { Activity, Layers } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

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

function formatElapsed(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "--";
  return formatDuration(seconds * 1000);
}

/* --------------------------------------------------------------------------
   Task row
   -------------------------------------------------------------------------- */

function TaskRow({ task }: { task: ActiveTaskItem }) {
  return (
    <div className="flex items-center justify-between gap-[var(--spacing-2)] py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {task.job_type}
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

export function ActiveTasksWidget() {
  const { data: tasks, isLoading, error, refetch } = useActiveTasks();

  return (
    <WidgetBase
      title="Active Tasks"
      icon={<Activity size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
    >
      {!tasks || tasks.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No active tasks"
          description="All jobs are idle. Submit a new job to see it here."
        />
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <TaskRow key={task.job_id} task={task} />
          ))}
        </div>
      )}
    </WidgetBase>
  );
}
