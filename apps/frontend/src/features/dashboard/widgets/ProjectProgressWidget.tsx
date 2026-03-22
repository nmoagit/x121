import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useProjectProgress } from "@/features/dashboard/hooks/use-dashboard";
import type { ProjectProgressItem } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import {
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_LABEL,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";
import { BarChart3, Folder } from "@/tokens/icons";

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
  const valueColor = complete ? "text-green-400" : total > 0 ? "text-cyan-400" : "text-[var(--color-text-muted)]";

  return (
    <span className="flex items-center gap-1 font-mono text-xs">
      <span className={`tabular-nums font-bold ${valueColor}`}>
        {current}/{total}
      </span>
      <span className={TERMINAL_LABEL}>{label}</span>
    </span>
  );
}

/* --------------------------------------------------------------------------
   Project row — primary metric: model completeness
   -------------------------------------------------------------------------- */

function ProjectRow({ item }: { item: ProjectProgressItem }) {
  const scenePct = item.scenes_total > 0 ? Math.round((item.scenes_approved / item.scenes_total) * 100) : 0;
  const allApproved = item.scenes_total > 0 && item.scenes_approved >= item.scenes_total;
  const fillColor = allApproved ? "bg-green-400" : "bg-cyan-400";

  return (
    <div className={`py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-xs text-[var(--color-text-primary)] truncate">
          {item.project_name}
        </p>
        <span className={`font-mono text-xs tabular-nums shrink-0 ml-2 ${allApproved ? "text-green-400" : "text-cyan-400"}`}>
          {item.scenes_approved}/{item.scenes_total} scenes
        </span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillColor}`}
          style={{ width: `${Math.min(scenePct, 100)}%` }}
        />
      </div>

      {/* Mini-indicators: models, images, metadata */}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {(item.model_count ?? 0) > 0 && (
          <>
            <MiniIndicator label="models" current={item.models_ready ?? 0} total={item.model_count ?? 0} />
            <span className={TERMINAL_PIPE}>|</span>
          </>
        )}
        {item.images_total != null && (
          <>
            <MiniIndicator label="images" current={item.images_uploaded ?? 0} total={item.images_total} />
            <span className={TERMINAL_PIPE}>|</span>
          </>
        )}
        {item.metadata_total != null && (
          <MiniIndicator label="metadata" current={item.metadata_approved ?? 0} total={item.metadata_total} />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function ProjectProgressWidget({ pipelineId }: { pipelineId?: number } = {}) {
  const { data: projects, isLoading, error, refetch } = useProjectProgress(pipelineId);

  return (
    <WidgetBase
      title="Project Progress"
      icon={<BarChart3 size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        <Link to="/projects" className="font-mono text-xs text-cyan-400 hover:underline">
          Projects
        </Link>
      }
    >
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<Folder size={32} />}
          title="No active projects"
          description="Create a project to track progress."
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
