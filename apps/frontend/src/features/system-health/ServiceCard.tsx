/**
 * Individual service health card (PRD-80).
 *
 * Displays the service name, status badge, latency, last-checked time,
 * and an error message (when applicable).
 */

import { Card } from "@/components/composite/Card";
import { formatDateTime } from "@/lib/format";
import { Activity } from "@/tokens/icons";

import { HealthStatusBadge } from "./HealthStatusBadge";
import type { ServiceStatusResponse } from "./types";
import { SERVICE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ServiceCardProps {
  service: ServiceStatusResponse;
  onClick?: (service: ServiceStatusResponse) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Format latency in milliseconds, or "--" when null. */
function formatLatency(ms: number | null): string {
  if (ms === null) return "--";
  return `${ms}ms`;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ServiceCard({ service, onClick }: ServiceCardProps) {
  const label = SERVICE_LABELS[service.service_name] ?? service.service_name;

  return (
    <Card
      elevation="sm"
      padding="none"
      className="cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]"
    >
      <div
        className="px-[var(--spacing-4)] py-[var(--spacing-3)]"
        onClick={() => onClick?.(service)}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") onClick?.(service);
        }}
      >
        {/* Header: service name + status badge */}
        <div className="flex items-center justify-between gap-[var(--spacing-2)]">
          <div className="flex items-center gap-[var(--spacing-2)] min-w-0">
            <Activity size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {label}
            </span>
          </div>
          <HealthStatusBadge status={service.status} />
        </div>

        {/* Latency + last checked */}
        <div className="mt-[var(--spacing-2)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>Latency: {formatLatency(service.latency_ms)}</span>
          <span>{formatDateTime(service.checked_at)}</span>
        </div>

        {/* Error message */}
        {service.error_message && (
          <p className="mt-[var(--spacing-2)] text-xs text-[var(--color-action-danger)] truncate">
            {service.error_message}
          </p>
        )}
      </div>
    </Card>
  );
}
