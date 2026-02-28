/**
 * TanStack Query hooks for API usage & observability (PRD-106).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ApiAlertConfig,
  ApiMetric,
  CreateAlertConfig,
  EndpointBreakdown,
  Granularity,
  HeatmapCell,
  MetricsFilter,
  MetricsSummary,
  RateLimitUtilization,
  TimePeriod,
  TopConsumer,
  UpdateAlertConfig,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const observabilityKeys = {
  all: ["api-observability"] as const,
  metrics: (filters: MetricsFilter) =>
    [...observabilityKeys.all, "metrics", filters] as const,
  summary: (period: TimePeriod) =>
    [...observabilityKeys.all, "summary", period] as const,
  endpoints: (period: TimePeriod) =>
    [...observabilityKeys.all, "endpoints", period] as const,
  topConsumers: (sort: string, period: TimePeriod, limit: number) =>
    [...observabilityKeys.all, "top-consumers", sort, period, limit] as const,
  heatmap: (granularity: Granularity, period: TimePeriod) =>
    [...observabilityKeys.all, "heatmap", granularity, period] as const,
  rateLimits: () => [...observabilityKeys.all, "rate-limits"] as const,
  rateLimitHistory: (keyId: number) =>
    [...observabilityKeys.all, "rate-limit-history", keyId] as const,
  alerts: () => [...observabilityKeys.all, "alerts"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Default polling interval for auto-refresh: 30 seconds. */
const POLL_INTERVAL_MS = 30_000;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function buildMetricsParams(filters: MetricsFilter): string {
  const params = new URLSearchParams();
  if (filters.period) params.set("period", filters.period);
  if (filters.granularity) params.set("granularity", filters.granularity);
  if (filters.endpoint) params.set("endpoint", filters.endpoint);
  if (filters.api_key_id) params.set("api_key_id", String(filters.api_key_id));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch raw metrics with optional filters. */
export function useMetrics(filters: MetricsFilter, autoRefresh = false) {
  return useQuery({
    queryKey: observabilityKeys.metrics(filters),
    queryFn: () =>
      api.get<ApiMetric[]>(`/admin/api-metrics${buildMetricsParams(filters)}`),
    refetchInterval: autoRefresh ? POLL_INTERVAL_MS : false,
  });
}

/** Fetch summary statistics for a time period. */
export function useMetricsSummary(period: TimePeriod, autoRefresh = false) {
  return useQuery({
    queryKey: observabilityKeys.summary(period),
    queryFn: () =>
      api.get<MetricsSummary>(`/admin/api-metrics/summary?period=${period}`),
    refetchInterval: autoRefresh ? POLL_INTERVAL_MS : false,
  });
}

/** Fetch per-endpoint breakdown for a time period. */
export function useEndpointBreakdown(period: TimePeriod, autoRefresh = false) {
  return useQuery({
    queryKey: observabilityKeys.endpoints(period),
    queryFn: () =>
      api.get<EndpointBreakdown[]>(
        `/admin/api-metrics/endpoints?period=${period}`,
      ),
    refetchInterval: autoRefresh ? POLL_INTERVAL_MS : false,
  });
}

/** Fetch top API consumers ranked by a given sort field. */
export function useTopConsumers(
  sort: string = "request_count",
  period: TimePeriod = "24h",
  limit: number = 10,
) {
  return useQuery({
    queryKey: observabilityKeys.topConsumers(sort, period, limit),
    queryFn: () =>
      api.get<TopConsumer[]>(
        `/admin/api-metrics/top-consumers?sort=${sort}&period=${period}&limit=${limit}`,
      ),
  });
}

/** Fetch heatmap data for the endpoint x time grid. */
export function useHeatmap(granularity: Granularity, period: TimePeriod) {
  return useQuery({
    queryKey: observabilityKeys.heatmap(granularity, period),
    queryFn: () =>
      api.get<HeatmapCell[]>(
        `/admin/api-metrics/heatmap?granularity=${granularity}&period=${period}`,
      ),
  });
}

/** Fetch current rate limit utilization for all keys. */
export function useRateLimits() {
  return useQuery({
    queryKey: observabilityKeys.rateLimits(),
    queryFn: () =>
      api.get<RateLimitUtilization[]>("/admin/api-metrics/rate-limits"),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** Fetch historical rate limit utilization for a specific key. */
export function useRateLimitHistory(keyId: number) {
  return useQuery({
    queryKey: observabilityKeys.rateLimitHistory(keyId),
    queryFn: () =>
      api.get<RateLimitUtilization[]>(
        `/admin/api-metrics/rate-limits/${keyId}/history`,
      ),
    enabled: keyId > 0,
  });
}

/** Fetch all alert configurations. */
export function useAlertConfigs() {
  return useQuery({
    queryKey: observabilityKeys.alerts(),
    queryFn: () => api.get<ApiAlertConfig[]>("/admin/api-alerts"),
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new alert configuration. */
export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertConfig) =>
      api.post<ApiAlertConfig>("/admin/api-alerts", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: observabilityKeys.alerts() });
    },
  });
}

/** Update an existing alert configuration. */
export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAlertConfig & { id: number }) =>
      api.put<ApiAlertConfig>(`/admin/api-alerts/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: observabilityKeys.alerts() });
    },
  });
}

/** Delete an alert configuration. */
export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/api-alerts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: observabilityKeys.alerts() });
    },
  });
}
