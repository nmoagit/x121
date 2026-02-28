/**
 * API usage & observability types (PRD-106).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Enums & branded types
   -------------------------------------------------------------------------- */

export type Granularity = "1m" | "5m" | "1h" | "1d";
export type AlertType = "error_rate" | "response_time" | "rate_limit";
export type Comparison = "gt" | "lt" | "gte" | "lte";
export type TimePeriod = "1h" | "6h" | "24h" | "7d" | "30d";

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

/** Human-readable labels for granularity values. */
export const GRANULARITY_LABEL: Record<Granularity, string> = {
  "1m": "1 Minute",
  "5m": "5 Minutes",
  "1h": "1 Hour",
  "1d": "1 Day",
};

/** Human-readable labels for alert types. */
export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  error_rate: "Error Rate",
  response_time: "Response Time",
  rate_limit: "Rate Limit",
};

/** Badge variant for each alert type. */
export const ALERT_TYPE_BADGE_VARIANT: Record<AlertType, BadgeVariant> = {
  error_rate: "danger",
  response_time: "warning",
  rate_limit: "info",
};

/** Human-readable labels for comparison operators. */
export const COMPARISON_LABEL: Record<Comparison, string> = {
  gt: ">",
  lt: "<",
  gte: "\u2265",
  lte: "\u2264",
};

/** Options for the time period selector. */
export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "1h", label: "Last Hour" },
  { value: "6h", label: "Last 6 Hours" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

/** Utilization threshold breakpoints for color coding. */
export const UTILIZATION_THRESHOLDS = {
  /** Green zone: below this percentage. */
  low: 60,
  /** Yellow zone: between low and high. */
  high: 80,
} as const;

/* --------------------------------------------------------------------------
   Metric data
   -------------------------------------------------------------------------- */

/** A single aggregated API metric record. */
export interface ApiMetric {
  id: number;
  period_start: string;
  period_granularity: Granularity;
  endpoint: string;
  http_method: string;
  api_key_id: number | null;
  request_count: number;
  error_count_4xx: number;
  error_count_5xx: number;
  response_time_p50_ms: number | null;
  response_time_p95_ms: number | null;
  response_time_p99_ms: number | null;
  response_time_avg_ms: number | null;
  total_request_bytes: number;
  total_response_bytes: number;
  created_at: string;
}

/** Summary statistics for a time period. */
export interface MetricsSummary {
  total_requests: number;
  error_rate: number;
  avg_response_time: number;
  top_endpoints: EndpointBreakdown[];
}

/** Per-endpoint aggregated stats. */
export interface EndpointBreakdown {
  endpoint: string;
  http_method: string;
  request_count: number;
  error_rate: number;
  p50: number;
  p95: number;
  p99: number;
}

/** A single top consumer entry. */
export interface TopConsumer {
  api_key_id: number | null;
  request_count: number;
  error_rate: number;
  total_bandwidth: number;
}

/* --------------------------------------------------------------------------
   Heatmap
   -------------------------------------------------------------------------- */

/** A single cell in the endpoint heatmap. */
export interface HeatmapCell {
  endpoint: string;
  time_bucket: string;
  request_count: number;
  /** Normalized intensity 0.0-1.0. */
  intensity: number;
}

/**
 * Full heatmap data returned by the API.
 *
 * The backend returns `HeatmapCell[]` directly as `data`. This alias
 * preserves the named type for component props.
 */
export type HeatmapData = HeatmapCell[];

/* --------------------------------------------------------------------------
   Alerts
   -------------------------------------------------------------------------- */

/** An alert configuration rule. */
export interface ApiAlertConfig {
  id: number;
  name: string;
  alert_type: AlertType;
  endpoint_filter: string | null;
  api_key_filter: number | null;
  threshold_value: number;
  comparison: Comparison;
  window_minutes: number;
  cooldown_minutes: number;
  enabled: boolean;
  last_fired_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new alert config. */
export interface CreateAlertConfig {
  name: string;
  alert_type: AlertType;
  endpoint_filter?: string | null;
  api_key_filter?: number | null;
  threshold_value: number;
  comparison: Comparison;
  window_minutes: number;
  cooldown_minutes: number;
  enabled?: boolean;
}

/** Input for updating an existing alert config (all fields optional). */
export interface UpdateAlertConfig {
  name?: string;
  alert_type?: AlertType;
  endpoint_filter?: string | null;
  api_key_filter?: number | null;
  threshold_value?: number;
  comparison?: Comparison;
  window_minutes?: number;
  cooldown_minutes?: number;
  enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Rate limits
   -------------------------------------------------------------------------- */

/** Current rate limit utilization for an API key. */
export interface RateLimitUtilization {
  id: number;
  api_key_id: number;
  period_start: string;
  period_granularity: string;
  requests_made: number;
  rate_limit: number;
  utilization_pct: number;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Shared helpers
   -------------------------------------------------------------------------- */

/** Format an ISO 8601 timestamp to a short time string (HH:MM). */
export function formatChartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --------------------------------------------------------------------------
   Query filter params
   -------------------------------------------------------------------------- */

/** Filters for the metrics list endpoint. */
export interface MetricsFilter {
  period?: TimePeriod;
  granularity?: Granularity;
  endpoint?: string;
  api_key_id?: number;
}
