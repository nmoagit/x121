import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useFooterStatus } from "@/app/footer";
import { Card } from "@/components/composite/Card";
import { Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives/Badge";
import { Activity, HardDrive, Cpu, Users } from "@/tokens/icons";
import type { ReactNode } from "react";

const HEALTH_BADGE: Record<string, BadgeVariant> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

interface ServiceCardProps {
  name: string;
  icon: ReactNode;
  status: string;
  detail?: string | null;
  latency?: number | null;
}

function ServiceCard({ name, icon, status, detail, latency }: ServiceCardProps) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-[var(--spacing-3)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{name}</h3>
            {detail && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{detail}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-[var(--spacing-2)]">
          {latency != null && (
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{latency}ms</span>
          )}
          <Badge variant={HEALTH_BADGE[status] ?? "default"} size="sm">
            {status}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

export default function SystemHealthPage() {
  useSetPageTitle("System Health", "Service status and uptime monitoring.");
  const { services, cloudGpu, jobs } = useFooterStatus();

  const serviceList = services
    ? [
        {
          name: "Database",
          icon: <HardDrive size={20} />,
          status: services.database.status,
          detail: services.database.detail,
          latency: services.database.latency_ms,
        },
        {
          name: "ComfyUI",
          icon: <Cpu size={20} />,
          status: services.comfyui.status,
          detail: services.comfyui.detail,
          latency: services.comfyui.latency_ms,
        },
        {
          name: "Workers",
          icon: <Users size={20} />,
          status: services.workers.status,
          detail: services.workers.detail,
          latency: services.workers.latency_ms,
        },
      ]
    : [];

  const healthyCt = serviceList.filter((s) => s.status === "healthy").length;
  const degradedCt = serviceList.filter((s) => s.status === "degraded").length;
  const downCt = serviceList.filter((s) => s.status === "down").length;

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-5">
          <Card elevation="flat" padding="sm">
            <p className="text-xs text-[var(--color-text-muted)]">Services</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">{serviceList.length}</p>
          </Card>
          <Card elevation="flat" padding="sm">
            <p className="text-xs text-[var(--color-text-muted)]">Healthy</p>
            <p className="text-lg font-semibold text-green-500">{healthyCt}</p>
          </Card>
          <Card elevation="flat" padding="sm">
            <p className="text-xs text-[var(--color-text-muted)]">Degraded</p>
            <p className="text-lg font-semibold text-yellow-500">{degradedCt}</p>
          </Card>
          <Card elevation="flat" padding="sm">
            <p className="text-xs text-[var(--color-text-muted)]">Down</p>
            <p className="text-lg font-semibold text-red-500">{downCt}</p>
          </Card>
          <Card elevation="flat" padding="sm">
            <p className="text-xs text-[var(--color-text-muted)]">GPU Pods</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">{cloudGpu?.active_pods ?? 0}</p>
          </Card>
        </div>

        {/* Job summary */}
        <Card padding="md">
          <div className="flex items-center gap-[var(--spacing-3)]">
            <Activity size={16} className="text-[var(--color-text-muted)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">
              {jobs.running} running, {jobs.queued} queued
              {jobs.overallProgress > 0 && ` — ${jobs.overallProgress}% overall`}
            </span>
          </div>
        </Card>

        {/* Service cards */}
        <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3">
          {serviceList.map((s) => (
            <ServiceCard key={s.name} {...s} />
          ))}
        </div>
      </Stack>
    </div>
  );
}
