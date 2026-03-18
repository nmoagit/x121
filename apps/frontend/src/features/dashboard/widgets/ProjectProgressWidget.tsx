import { Link } from "@tanstack/react-router";

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

/* --------------------------------------------------------------------------
   Mini-indicator for project rows
   -------------------------------------------------------------------------- */

function MiniIndicator({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  const complete = total > 0 && current === total;
  const dotColor = complete
    ? "bg-[var(--color-action-success)]"
    : total > 0
      ? "bg-[var(--color-action-warning)]"
      : "bg-[var(--color-surface-tertiary)]";

  return (
    <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      <span className="tabular-nums">
        {current}/{total}
      </span>
      <span>{label}</span>
    </span>
  );
}

/* --------------------------------------------------------------------------
   Project row
   -------------------------------------------------------------------------- */

function ProjectRow({ item }: { item: ProjectProgressItem }) {
  const barColor = COLOR_CLASSES[item.status_color] ?? COLOR_CLASSES.red;
  const trackColor = TRACK_COLOR[item.status_color] ?? TRACK_COLOR.red;

  const hasExtendedData =
    item.model_count != null || item.images_total != null || item.metadata_total != null;

  return (
    <div className="py-[var(--spacing-2)] border-b border-[var(--color-border-default)] last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
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

      {/* Mini-indicators row (when extended data is available) */}
      {hasExtendedData && (
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {item.model_count != null && (
            <MiniIndicator
              label="models"
              current={item.models_ready ?? 0}
              total={item.model_count}
            />
          )}
          {item.images_total != null && (
            <MiniIndicator
              label="images"
              current={item.images_uploaded ?? 0}
              total={item.images_total}
            />
          )}
          {item.metadata_total != null && (
            <MiniIndicator
              label="metadata"
              current={item.metadata_approved ?? 0}
              total={item.metadata_total}
            />
          )}
        </div>
      )}
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
      headerActions={
        <Link to="/projects" className="text-xs text-[var(--color-action-primary)] hover:underline">
          Projects
        </Link>
      }
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
