/**
 * Infrastructure Status widget for StudioPulse dashboard (admin only).
 *
 * Shows GPU instances, service health dots, and budget status from
 * the existing footer status endpoint.
 */

import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { useInfraStatusWidget } from "@/features/dashboard/hooks/use-dashboard";
import type { FooterServices, CloudGpuInfo } from "@/app/footer/types";
import { StatusDot } from "@/app/footer/FooterSegment";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatCents } from "@/lib/format";
import { Server, Cloud } from "@/tokens/icons";
import type { ServiceHealth } from "@/app/footer/types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const BUDGET_BADGE: Record<string, "success" | "warning" | "danger"> = {
  ok: "success",
  warning: "warning",
  exceeded: "danger",
};

function ServiceDot({ name, health }: { name: string; health: ServiceHealth }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot health={health} />
      <span className="text-xs text-[var(--color-text-secondary)] capitalize">{name}</span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Widget
   -------------------------------------------------------------------------- */

export function InfraStatusWidget() {
  const { data: footerData, isLoading, error, refetch } = useInfraStatusWidget();

  const services: FooterServices | null = footerData?.services ?? null;
  const gpu: CloudGpuInfo | null = footerData?.cloud_gpu ?? null;

  return (
    <WidgetBase
      title="Infrastructure"
      icon={<Server size={16} />}
      loading={isLoading}
      error={error?.message}
      onRetry={() => void refetch()}
      headerActions={
        <Link to="/admin/infrastructure" className="text-xs text-[var(--color-action-primary)] hover:underline">
          Manage
        </Link>
      }
    >
      {!services && !gpu ? (
        <EmptyState
          icon={<Cloud size={32} />}
          title="No data"
          description="Infrastructure status unavailable."
        />
      ) : (
        <div className="space-y-4">
          {/* GPU info */}
          {gpu && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  GPU Instances
                </span>
                <span className="text-sm font-bold text-[var(--color-text-primary)] tabular-nums">
                  {gpu.active_pods}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">Cost</span>
                <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {formatCents(gpu.cost_per_hour_cents)}/hr
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-muted)]">Budget</span>
                <Badge variant={BUDGET_BADGE[gpu.budget_status] ?? "default"} size="sm">
                  {gpu.budget_status}
                </Badge>
              </div>
            </div>
          )}

          {/* Service health dots */}
          {services && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Services
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <ServiceDot name="ComfyUI" health={services.comfyui.status} />
                <ServiceDot name="Database" health={services.database.status} />
                <ServiceDot name="Workers" health={services.workers.status} />
                <ServiceDot name="Storage" health={services.storage.status} />
                <ServiceDot name="Scheduler" health={services.scheduler.status} />
                <ServiceDot name="Auto-scaler" health={services.autoscaler.status} />
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetBase>
  );
}
