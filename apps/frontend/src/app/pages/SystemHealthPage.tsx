import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useFooterStatus } from "@/app/footer";
import { Stack } from "@/components/layout";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
} from "@/lib/ui-classes";
import { TYPO_DATA, TYPO_DATA_MUTED, TYPO_LABEL } from "@/lib/typography-tokens";
import { Activity, HardDrive, Cpu, Users } from "@/tokens/icons";
import type { ReactNode } from "react";

interface ServiceCardProps {
  name: string;
  icon: ReactNode;
  status: string;
  detail?: string | null;
  latency?: number | null;
}

function ServiceCard({ name, icon, status, detail, latency }: ServiceCardProps) {
  const statusColor = status === "healthy"
    ? "text-[var(--color-data-green)]"
    : status === "degraded"
      ? "text-[var(--color-data-orange)]"
      : status === "down"
        ? "text-[var(--color-data-red)]"
        : "text-[var(--color-text-muted)]";

  return (
    <div className={TERMINAL_PANEL}>
      <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className="text-[var(--color-text-muted)]">{icon}</span>
          <span className={TERMINAL_HEADER_TITLE}>{name}</span>
        </div>
        <div className="flex items-center gap-[var(--spacing-2)]">
          {latency != null && (
            <span className="font-mono text-[10px] text-[var(--color-data-cyan)] tabular-nums">{latency}ms</span>
          )}
          <span className={`${TYPO_DATA} uppercase tracking-wide ${statusColor}`}>
            {status}
          </span>
        </div>
      </div>
      {detail && (
        <div className={TERMINAL_BODY}>
          <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{detail}</p>
        </div>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  useSetPageTitle("System Health", "Service status and uptime monitoring.");
  const { services, cloudGpu, jobs } = useFooterStatus();

  const serviceList = services
    ? [
        {
          name: "Database",
          icon: <HardDrive size={16} />,
          status: services.database.status,
          detail: services.database.detail,
          latency: services.database.latency_ms,
        },
        {
          name: "ComfyUI",
          icon: <Cpu size={16} />,
          status: services.comfyui.status,
          detail: services.comfyui.detail,
          latency: services.comfyui.latency_ms,
        },
        {
          name: "Workers",
          icon: <Users size={16} />,
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
        {/* Summary row */}
        <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-5">
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_BODY}>
              <p className={TYPO_LABEL}>Services</p>
              <p className="font-mono text-lg font-semibold text-[var(--color-data-cyan)]">{serviceList.length}</p>
            </div>
          </div>
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_BODY}>
              <p className={TYPO_LABEL}>Healthy</p>
              <p className="font-mono text-lg font-semibold text-[var(--color-data-green)]">{healthyCt}</p>
            </div>
          </div>
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_BODY}>
              <p className={TYPO_LABEL}>Degraded</p>
              <p className="font-mono text-lg font-semibold text-[var(--color-data-orange)]">{degradedCt}</p>
            </div>
          </div>
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_BODY}>
              <p className={TYPO_LABEL}>Down</p>
              <p className="font-mono text-lg font-semibold text-[var(--color-data-red)]">{downCt}</p>
            </div>
          </div>
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_BODY}>
              <p className={TYPO_LABEL}>GPU Pods</p>
              <p className="font-mono text-lg font-semibold text-[var(--color-data-cyan)]">{cloudGpu?.active_pods ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Job summary */}
        <div className={TERMINAL_PANEL}>
          <div className={`${TERMINAL_BODY} flex items-center gap-[var(--spacing-3)]`}>
            <Activity size={14} className="text-[var(--color-text-muted)]" />
            <span className={TYPO_DATA_MUTED}>
              <span className="text-[var(--color-data-cyan)]">{jobs.running}</span> running, <span className="text-[var(--color-data-orange)]">{jobs.queued}</span> queued
              {jobs.overallProgress > 0 && <> — <span className="text-[var(--color-data-green)]">{jobs.overallProgress}%</span> overall</>}
            </span>
          </div>
        </div>

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
