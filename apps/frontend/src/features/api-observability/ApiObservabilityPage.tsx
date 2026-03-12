/**
 * Main API Usage & Observability dashboard page (PRD-106).
 *
 * Provides time range selection, auto-refresh toggle, and all
 * sub-panels: volume chart, response times, error rates, heatmap,
 * rate limits, top consumers, and alert configuration.
 */

import { useState } from "react";

import { Card } from "@/components/composite/Card";
import { Badge, Select, Spinner, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { AlertTriangle, RefreshCw } from "@/tokens/icons";

import { AlertConfigPanel } from "./AlertConfigPanel";
import { EndpointHeatmap } from "./EndpointHeatmap";
import { ErrorRateChart } from "./ErrorRateChart";
import {
  useAlertConfigs,
  useHeatmap,
  useMetrics,
  useMetricsSummary,
} from "./hooks/use-api-observability";
import { RateLimitPanel } from "./RateLimitPanel";
import { RequestVolumeChart } from "./RequestVolumeChart";
import { ResponseTimeChart } from "./ResponseTimeChart";
import { TopConsumersTable } from "./TopConsumersTable";
import type { Granularity, TimePeriod } from "./types";
import { TIME_PERIOD_OPTIONS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const GRANULARITY_FOR_PERIOD: Record<TimePeriod, Granularity> = {
  "1h": "1m",
  "6h": "5m",
  "24h": "1h",
  "7d": "1h",
  "30d": "1d",
};

/* --------------------------------------------------------------------------
   Sub-component: summary stats
   -------------------------------------------------------------------------- */

interface SummaryBarProps {
  period: TimePeriod;
  autoRefresh: boolean;
}

function SummaryBar({ period, autoRefresh }: SummaryBarProps) {
  const { data: summary, isLoading } = useMetricsSummary(period, autoRefresh);

  if (isLoading) {
    return (
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Spinner size="sm" />
        <span className="text-xs text-[var(--color-text-muted)]">Loading summary...</span>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-[var(--spacing-4)]">
      <Card elevation="flat" padding="sm" className="flex items-center gap-[var(--spacing-2)]">
        <span className="text-xs text-[var(--color-text-muted)]">Requests</span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {summary.total_requests.toLocaleString()}
        </span>
      </Card>
      <Card elevation="flat" padding="sm" className="flex items-center gap-[var(--spacing-2)]">
        <span className="text-xs text-[var(--color-text-muted)]">Error Rate</span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {summary.error_rate.toFixed(1)}%
        </span>
      </Card>
      <Card elevation="flat" padding="sm" className="flex items-center gap-[var(--spacing-2)]">
        <span className="text-xs text-[var(--color-text-muted)]">Avg Response</span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {summary.avg_response_time.toFixed(0)}ms
        </span>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sub-component: active alert banner
   -------------------------------------------------------------------------- */

function ActiveAlertBanner() {
  const { data: alerts } = useAlertConfigs();
  if (!alerts) return null;

  const recentlyFired = alerts.filter((a) => a.enabled && a.last_fired_at);
  if (recentlyFired.length === 0) return null;

  return (
    <Card elevation="flat" padding="sm" className="border-l-4 border-l-[var(--color-action-warning)]">
      <div className="flex items-center gap-[var(--spacing-2)]">
        <AlertTriangle size={16} className="shrink-0 text-[var(--color-action-warning)]" aria-hidden />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {recentlyFired.length} alert{recentlyFired.length > 1 ? "s" : ""} recently fired
        </span>
        <Badge variant="warning" size="sm">Active</Badge>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ApiObservabilityPage() {
  useSetPageTitle("API Observability");
  const [period, setPeriod] = useState<TimePeriod>("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const granularity = GRANULARITY_FOR_PERIOD[period];

  const { data: metrics, isLoading: metricsLoading } = useMetrics(
    { period, granularity },
    autoRefresh,
  );
  const { data: heatmapData, isLoading: heatmapLoading } = useHeatmap(
    granularity,
    period,
  );

  return (
    <Stack gap={6}>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-end gap-[var(--spacing-3)]">
        <Select
          options={TIME_PERIOD_OPTIONS}
          value={period}
          onChange={(v) => setPeriod(v as TimePeriod)}
        />
        <Toggle
          checked={autoRefresh}
          onChange={setAutoRefresh}
          size="sm"
          label="Auto-refresh"
        />
        {autoRefresh && (
          <RefreshCw size={14} className="animate-spin text-[var(--color-text-muted)]" aria-label="Auto-refreshing" />
        )}
      </div>

      {/* Active alert banner */}
      <ActiveAlertBanner />

      {/* Summary stats */}
      <SummaryBar period={period} autoRefresh={autoRefresh} />

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-[var(--spacing-4)] lg:grid-cols-2">
        <RequestVolumeChart data={metrics ?? []} isLoading={metricsLoading} />
        <ResponseTimeChart data={metrics ?? []} isLoading={metricsLoading} />
      </div>

      {/* Error rate chart */}
      <ErrorRateChart data={metrics ?? []} isLoading={metricsLoading} />

      {/* Heatmap */}
      <EndpointHeatmap
        data={heatmapData}
        isLoading={heatmapLoading}
        granularity={granularity}
        period={period}
      />

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-[var(--spacing-4)] lg:grid-cols-2">
        <TopConsumersTable period={period} />
        <RateLimitPanel />
      </div>

      {/* Alert configuration */}
      <AlertConfigPanel />
    </Stack>
  );
}
