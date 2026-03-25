/**
 * Grid of service health cards with fleet overview summary (PRD-80).
 *
 * Auto-refreshes via the useServiceStatuses hook (30s polling).
 * Shows an aggregate summary row above the grid.
 */

import { Card } from "@/components/composite/Card";
import { ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Activity, AlertCircle } from "@/tokens/icons";

import { useServiceStatuses } from "./hooks/use-system-health";
import { ServiceCard } from "./ServiceCard";
import type { HealthStatus, ServiceStatusResponse } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

interface FleetSummary {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
}

function buildFleetSummary(services: ServiceStatusResponse[]): FleetSummary {
  const summary: FleetSummary = { total: 0, healthy: 0, degraded: 0, down: 0 };
  for (const s of services) {
    summary.total += 1;
    const key: HealthStatus = s.status;
    if (key in summary) {
      summary[key] += 1;
    }
  }
  return summary;
}

/* --------------------------------------------------------------------------
   Sub-component: Summary stat badge (reuses Card like WorkerDashboard)
   -------------------------------------------------------------------------- */

interface SummaryStatProps {
  label: string;
  value: number;
}

function SummaryStat({ label, value }: SummaryStatProps) {
  return (
    <Card elevation="flat" padding="sm">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--color-text-primary)]">{value}</p>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ServiceStatusGridProps {
  onServiceClick?: (service: ServiceStatusResponse) => void;
}

export function ServiceStatusGrid({ onServiceClick }: ServiceStatusGridProps) {
  const { data: services, isLoading, error } = useServiceStatuses();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <ContextLoader size={64} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
        <AlertCircle size={24} className="text-[var(--color-action-danger)]" aria-hidden />
        <p className="text-sm text-[var(--color-text-muted)]">
          Failed to load service statuses.
        </p>
      </div>
    );
  }

  if (!services || services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
        <Activity size={32} className="text-[var(--color-text-muted)]" aria-hidden />
        <p className="text-sm text-[var(--color-text-muted)]">
          No services registered.
        </p>
      </div>
    );
  }

  const summary = buildFleetSummary(services);

  return (
    <Stack gap={6}>
      {/* Fleet overview */}
      <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-4">
        <SummaryStat label="Total" value={summary.total} />
        <SummaryStat label="Healthy" value={summary.healthy} />
        <SummaryStat label="Degraded" value={summary.degraded} />
        <SummaryStat label="Down" value={summary.down} />
      </div>

      {/* Service cards grid */}
      <div className="grid grid-cols-1 gap-[var(--spacing-4)] sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <ServiceCard key={s.service_name} service={s} onClick={onServiceClick} />
        ))}
      </div>
    </Stack>
  );
}
