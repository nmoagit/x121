/**
 * EndpointHealthDashboard -- health overview for all webhook endpoints (PRD-99).
 *
 * Displays a card per endpoint showing success rate, average response time,
 * and status with color-coded badges (healthy/degraded/down).
 */

import { Card } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { Badge ,  WireframeLoader } from "@/components/primitives";
import { formatPercent } from "@/lib/format";

import { useHealthSummary } from "./hooks/use-webhook-testing";
import type { EndpointHealth } from "./types";
import {
  ENDPOINT_TYPE_LABEL,
  HEALTH_STATUS_BADGE,
  HEALTH_STATUS_LABEL,
} from "./types";

/* --------------------------------------------------------------------------
   Health card sub-component
   -------------------------------------------------------------------------- */

interface HealthCardProps {
  health: EndpointHealth;
}

function HealthCard({ health }: HealthCardProps) {
  const metrics = health.health;
  const statusVariant = HEALTH_STATUS_BADGE[metrics.status] ?? "default";
  const statusLabel = HEALTH_STATUS_LABEL[metrics.status] ?? metrics.status;
  const typeLabel = ENDPOINT_TYPE_LABEL[health.endpoint_type] ?? health.endpoint_type;

  return (
    <div data-testid={`health-card-${health.endpoint_id}`}>
    <Card elevation="sm" padding="md">
      <Stack gap={3}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {typeLabel} #{health.endpoint_id}
          </span>
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Success Rate
            </span>
            <span className="text-lg font-semibold text-[var(--color-text-primary)]">
              {formatPercent(metrics.success_rate_pct / 100, 1)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Avg Response
            </span>
            <span className="text-lg font-semibold text-[var(--color-text-primary)]">
              {Math.round(metrics.avg_response_time_ms)}ms
            </span>
          </div>
          <div>
            <span className="block text-xs text-[var(--color-text-muted)]">
              Recent Failures
            </span>
            <span className="text-lg font-semibold text-[var(--color-text-primary)]">
              {metrics.recent_failure_count}
            </span>
          </div>
        </div>
      </Stack>
    </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function EndpointHealthDashboard() {
  const { data: endpoints = [], isLoading } = useHealthSummary();

  if (isLoading) {
    return (
      <div data-testid="health-loading" className="flex items-center justify-center py-12">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div
        data-testid="health-empty"
        className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] p-8 text-center text-sm text-[var(--color-text-secondary)]"
      >
        No endpoint health data available.
      </div>
    );
  }

  return (
    <div data-testid="health-dashboard">
      <Stack gap={4}>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Endpoint Health Overview
        </h3>
        <Grid cols={3} gap={4}>
          {endpoints.map((ep) => (
            <HealthCard key={`${ep.endpoint_type}-${ep.endpoint_id}`} health={ep} />
          ))}
        </Grid>
      </Stack>
    </div>
  );
}
