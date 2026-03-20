/**
 * Infrastructure Status widget for StudioPulse dashboard (admin only).
 *
 * Shows GPU instances, service health dots, and budget status from
 * the existing footer status endpoint.
 */

import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { useInfraStatusWidget } from "@/features/dashboard/hooks/use-dashboard";
import type { FooterServices, CloudGpuInfo } from "@/app/footer/types";
import { StatusDot } from "@/app/footer/FooterSegment";
import { WidgetBase } from "@/features/dashboard/WidgetBase";
import { formatCents } from "@/lib/format";
import {
  TERMINAL_DIVIDER,
  TERMINAL_LABEL,
  TERMINAL_PIPE,
} from "@/lib/ui-classes";
import { Server, Cloud } from "@/tokens/icons";
import type { ServiceHealth } from "@/app/footer/types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const BUDGET_STATUS_COLOR: Record<string, string> = {
  ok: "text-green-400",
  warning: "text-orange-400",
  exceeded: "text-red-400",
};

function ServiceDot({ name, health }: { name: string; health: ServiceHealth }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot health={health} />
      <span className="font-mono text-xs text-[var(--color-text-secondary)] capitalize">{name}</span>
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
        <Link to="/admin/infrastructure" className="font-mono text-xs text-cyan-400 hover:underline">
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
        <div className="space-y-3">
          {/* GPU info */}
          {gpu && (
            <div className="space-y-1">
              <div className={`flex items-center justify-between py-1 ${TERMINAL_DIVIDER}`}>
                <span className={TERMINAL_LABEL}>GPU Instances</span>
                <span className="font-mono text-sm font-bold text-cyan-400 tabular-nums">
                  {gpu.active_pods}
                </span>
              </div>
              <div className={`flex items-center justify-between py-1 ${TERMINAL_DIVIDER}`}>
                <span className={TERMINAL_LABEL}>Cost</span>
                <span className="font-mono text-xs text-cyan-400 tabular-nums">
                  {formatCents(gpu.cost_per_hour_cents)}/hr
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className={TERMINAL_LABEL}>Budget</span>
                <span className={`font-mono text-xs font-medium ${BUDGET_STATUS_COLOR[gpu.budget_status] ?? "text-[var(--color-text-muted)]"}`}>
                  {gpu.budget_status}
                </span>
              </div>
            </div>
          )}

          {/* Service health dots */}
          {services && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={TERMINAL_LABEL}>Services</span>
                <span className={TERMINAL_PIPE}>|</span>
              </div>
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
