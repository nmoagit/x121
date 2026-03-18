/**
 * Model Readiness widget for StudioPulse dashboard.
 *
 * Shows an at-a-glance breakdown of how many models are ready, partially ready,
 * or not started across all projects. Composes the shared ReadinessSummaryBar
 * with a total count header.
 */

import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useReadinessSummaryWidget } from "@/features/dashboard/hooks/use-dashboard";
import { ReadinessSummaryBar } from "@/features/readiness";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { ShieldCheck, Users } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ModelReadinessWidget() {
  const { data: summary, isLoading, error, refetch } = useReadinessSummaryWidget();

  const total = summary?.total ?? 0;

  return (
    <WidgetBase
      title="Model Readiness"
      icon={<ShieldCheck size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        <Link
          to="/content/models"
          className="text-xs text-[var(--color-action-primary)] hover:underline"
        >
          View all
        </Link>
      }
    >
      {total === 0 || !summary ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No models"
          description="Add models to track readiness status."
        />
      ) : (
        <div className="space-y-3">
          {/* Total count */}
          <p className="text-lg font-bold text-[var(--color-text-primary)] tabular-nums">
            {total}
            <span className="text-xs font-normal text-[var(--color-text-muted)] ml-1">models</span>
          </p>

          {/* Reuse shared readiness summary bar */}
          <ReadinessSummaryBar summary={summary} />
        </div>
      )}
    </WidgetBase>
  );
}
