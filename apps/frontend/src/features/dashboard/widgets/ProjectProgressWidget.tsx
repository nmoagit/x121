import { EmptyState } from "@/components/domain";
import { useProjectProgress } from "@/features/dashboard/hooks/use-dashboard";
import type { ProjectProgressItem } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { cn } from "@/lib/cn";
import { BarChart3, Folder } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const COLOR_CLASSES: Record<string, string> = {
  green: "bg-[var(--color-action-success)]",
  yellow: "bg-[var(--color-action-warning)]",
  red: "bg-[var(--color-action-danger)]",
};

const TRACK_COLOR: Record<string, string> = {
  green: "bg-[var(--color-action-success)]/20",
  yellow: "bg-[var(--color-action-warning)]/20",
  red: "bg-[var(--color-action-danger)]/20",
};

/* --------------------------------------------------------------------------
   Project row
   -------------------------------------------------------------------------- */

function ProjectRow({ item }: { item: ProjectProgressItem }) {
  const barColor = COLOR_CLASSES[item.status_color] ?? COLOR_CLASSES.red;
  const trackColor = TRACK_COLOR[item.status_color] ?? TRACK_COLOR.red;

  return (
    <div className="py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {item.project_name}
        </p>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums shrink-0 ml-2">
          {item.scenes_approved}/{item.scenes_total} scenes
        </span>
      </div>

      <div className={cn("w-full h-2 rounded-full overflow-hidden", trackColor)}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(item.progress_pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ProjectProgressWidget() {
  const { data: projects, isLoading, error, refetch } = useProjectProgress();

  return (
    <WidgetBase
      title="Project Progress"
      icon={<BarChart3 size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
    >
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<Folder size={32} />}
          title="No active projects"
          description="Create a project to track scene approval progress."
        />
      ) : (
        <div className="flex flex-col">
          {projects.map((p) => (
            <ProjectRow key={p.project_id} item={p} />
          ))}
        </div>
      )}
    </WidgetBase>
  );
}
