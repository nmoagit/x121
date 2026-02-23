/**
 * TanStack Query hooks for Failure Pattern Tracking & Insights (PRD-64).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AlertResponse,
  CreatePatternFix,
  FailurePattern,
  HeatmapData,
  PatternFix,
  TrendPoint,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const failureAnalyticsKeys = {
  all: ["failure-analytics"] as const,
  patterns: (params?: { severity?: string; limit?: number; offset?: number }) =>
    [...failureAnalyticsKeys.all, "patterns", params] as const,
  pattern: (id: number) =>
    [...failureAnalyticsKeys.all, "pattern", id] as const,
  heatmap: (row: string, col: string) =>
    [...failureAnalyticsKeys.all, "heatmap", row, col] as const,
  trends: (patternId: number, periodDays: number) =>
    [...failureAnalyticsKeys.all, "trends", patternId, periodDays] as const,
  alerts: (workflowId?: number, characterId?: number) =>
    [...failureAnalyticsKeys.all, "alerts", workflowId, characterId] as const,
  fixes: (patternId: number) =>
    [...failureAnalyticsKeys.all, "fixes", patternId] as const,
};

/* --------------------------------------------------------------------------
   Pattern queries
   -------------------------------------------------------------------------- */

/** Fetches a paginated list of failure patterns. */
export function useFailurePatterns(params?: {
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.severity) queryParams.set("severity", params.severity);
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.offset) queryParams.set("offset", String(params.offset));
  const qs = queryParams.toString();

  return useQuery({
    queryKey: failureAnalyticsKeys.patterns(params),
    queryFn: () =>
      api.get<FailurePattern[]>(
        `/analytics/failure-patterns${qs ? `?${qs}` : ""}`,
      ),
  });
}

/** Fetches a single failure pattern by ID. */
export function useFailurePattern(id: number) {
  return useQuery({
    queryKey: failureAnalyticsKeys.pattern(id),
    queryFn: () =>
      api.get<FailurePattern | null>(`/analytics/failure-patterns/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Heatmap query
   -------------------------------------------------------------------------- */

/** Fetches heatmap matrix data for the specified row and column dimensions. */
export function useFailureHeatmap(rowDimension: string, colDimension: string) {
  const qs = new URLSearchParams({
    row_dimension: rowDimension,
    col_dimension: colDimension,
  }).toString();

  return useQuery({
    queryKey: failureAnalyticsKeys.heatmap(rowDimension, colDimension),
    queryFn: () => api.get<HeatmapData>(`/analytics/failure-heatmap?${qs}`),
    enabled: !!rowDimension && !!colDimension,
  });
}

/* --------------------------------------------------------------------------
   Trend query
   -------------------------------------------------------------------------- */

/** Fetches time-series trend data for a specific pattern. */
export function useFailureTrends(patternId: number, periodDays: number) {
  const qs = new URLSearchParams({
    pattern_id: String(patternId),
    period_days: String(periodDays),
  }).toString();

  return useQuery({
    queryKey: failureAnalyticsKeys.trends(patternId, periodDays),
    queryFn: () => api.get<TrendPoint[]>(`/analytics/failure-trends?${qs}`),
    enabled: patternId > 0,
  });
}

/* --------------------------------------------------------------------------
   Alert query
   -------------------------------------------------------------------------- */

/** Fetches high-severity patterns matching the given dimensions for alerts. */
export function useFailureAlerts(workflowId?: number, characterId?: number) {
  const qs = new URLSearchParams();
  if (workflowId) qs.set("workflow_id", String(workflowId));
  if (characterId) qs.set("character_id", String(characterId));
  const qsStr = qs.toString();

  return useQuery({
    queryKey: failureAnalyticsKeys.alerts(workflowId, characterId),
    queryFn: () =>
      api.get<AlertResponse>(
        `/analytics/failure-alerts${qsStr ? `?${qsStr}` : ""}`,
      ),
    enabled: !!workflowId || !!characterId,
  });
}

/* --------------------------------------------------------------------------
   Fix queries and mutations
   -------------------------------------------------------------------------- */

/** Fetches all fixes for a specific pattern. */
export function usePatternFixes(patternId: number) {
  return useQuery({
    queryKey: failureAnalyticsKeys.fixes(patternId),
    queryFn: () =>
      api.get<PatternFix[]>(`/failure-patterns/${patternId}/fixes`),
    enabled: patternId > 0,
  });
}

/** Creates a new fix for a failure pattern. */
export function useCreateFix(patternId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePatternFix) =>
      api.post<PatternFix>(`/failure-patterns/${patternId}/fixes`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: failureAnalyticsKeys.fixes(patternId),
      });
    },
  });
}

/** Updates the effectiveness rating of a fix. */
export function useUpdateFixEffectiveness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fixId,
      effectiveness,
    }: {
      fixId: number;
      effectiveness: string;
    }) =>
      api.patch<PatternFix>(
        `/failure-patterns/fixes/${fixId}/effectiveness`,
        { effectiveness },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: failureAnalyticsKeys.all,
      });
    },
  });
}
