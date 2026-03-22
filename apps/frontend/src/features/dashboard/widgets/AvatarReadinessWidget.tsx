/**
 * Model Readiness widget for StudioPulse dashboard.
 *
 * Shows per-project model readiness as ready/total with progress bars,
 * reusing data from the project progress endpoint.
 */

import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useProjectProgress } from "@/features/dashboard/hooks/use-dashboard";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import {
  TERMINAL_DIVIDER,
  TERMINAL_LABEL,
  TERMINAL_ROW_HOVER,
} from "@/lib/ui-classes";
import { ShieldCheck, Users } from "@/tokens/icons";

export function AvatarReadinessWidget() {
  const { data: projects, isLoading, error, refetch } = useProjectProgress();

  const totalModels = projects?.reduce((sum, p) => sum + (p.model_count ?? 0), 0) ?? 0;
  const totalReady = projects?.reduce((sum, p) => sum + (p.models_ready ?? 0), 0) ?? 0;

  return (
    <WidgetBase
      title="Avatar Readiness"
      icon={<ShieldCheck size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        <Link
          to="/projects"
          className="font-mono text-xs text-cyan-400 hover:underline"
        >
          Projects
        </Link>
      }
    >
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No projects"
          description="Create a project to track model readiness."
        />
      ) : (
        <div className="space-y-2">
          {/* Global summary */}
          <div className="flex items-center gap-2 font-mono">
            <span className={`text-lg font-bold tabular-nums ${totalReady >= totalModels && totalModels > 0 ? "text-green-400" : "text-cyan-400"}`}>
              {totalReady}/{totalModels}
            </span>
            <span className={TERMINAL_LABEL}>models ready</span>
          </div>

          {/* Per-project rows */}
          <div className="flex flex-col">
            {projects.map((p) => {
              const count = p.model_count ?? 0;
              const ready = p.models_ready ?? 0;
              const pct = count > 0 ? Math.round((ready / count) * 100) : 0;
              const allReady = count > 0 && ready >= count;

              return (
                <div key={p.project_id} className={`py-1.5 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: String(p.project_id) }}
                      search={{ tab: undefined, group: undefined }}
                      className="font-mono text-[11px] text-[var(--color-text-primary)] truncate hover:text-cyan-400 transition-colors"
                    >
                      {p.project_name}
                    </Link>
                    <span className={`font-mono text-[11px] tabular-nums shrink-0 ml-2 ${allReady ? "text-green-400" : count > 0 ? "text-cyan-400" : "text-[var(--color-text-muted)]"}`}>
                      {ready}/{count}
                    </span>
                  </div>
                  {count > 0 && (
                    <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${allReady ? "bg-green-400" : "bg-cyan-400"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </WidgetBase>
  );
}
