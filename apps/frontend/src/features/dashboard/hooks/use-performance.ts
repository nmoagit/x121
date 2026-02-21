import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface WorkflowPerformanceSummary {
  workflow_id: number | null;
  avg_time_per_frame_ms: number | null;
  p95_time_per_frame_ms: number | null;
  avg_gpu_time_ms: number | null;
  avg_vram_peak_mb: number | null;
  max_vram_peak_mb: number | null;
  avg_likeness_score: number | null;
  job_count: number;
  total_frames: number | null;
}

export interface WorkerPerformanceSummary {
  worker_id: number | null;
  avg_time_per_frame_ms: number | null;
  avg_gpu_time_ms: number | null;
  avg_vram_peak_mb: number | null;
  max_vram_peak_mb: number | null;
  job_count: number;
  total_gpu_time_ms: number | null;
  total_wall_time_ms: number | null;
}

export interface PerformanceTrendPoint {
  period: string;
  avg_time_per_frame_ms: number | null;
  avg_gpu_time_ms: number | null;
  avg_vram_peak_mb: number | null;
  avg_likeness_score: number | null;
  job_count: number;
}

export interface PerformanceOverview {
  total_gpu_hours: number;
  avg_time_per_frame_ms: number;
  peak_vram_mb: number;
  total_jobs: number;
  total_frames: number;
  top_workflows: WorkflowPerformanceSummary[];
  bottom_workflows: WorkflowPerformanceSummary[];
}

export interface WorkflowComparison {
  summaries: WorkflowPerformanceSummary[];
}

export interface PerformanceAlertThreshold {
  id: number;
  metric_name: string;
  scope_type: string;
  scope_id: number | null;
  warning_threshold: number;
  critical_threshold: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertThreshold {
  metric_name: string;
  scope_type: string;
  scope_id?: number | null;
  warning_threshold: number;
  critical_threshold: number;
}

export interface UpdateAlertThreshold {
  metric_name?: string;
  scope_type?: string;
  scope_id?: number | null;
  warning_threshold?: number;
  critical_threshold?: number;
  enabled?: boolean;
}

export interface PerformanceMetric {
  id: number;
  job_id: number;
  workflow_id: number | null;
  worker_id: number | null;
  project_id: number | null;
  character_id: number | null;
  scene_id: number | null;
  time_per_frame_ms: number | null;
  total_gpu_time_ms: number | null;
  total_wall_time_ms: number | null;
  vram_peak_mb: number | null;
  frame_count: number | null;
  quality_scores_json: Record<string, number> | null;
  pipeline_stages_json: Array<{ name: string; duration_ms: number }> | null;
  resolution_tier: string | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const performanceKeys = {
  all: ["performance"] as const,
  overview: (from: string, to: string) => [...performanceKeys.all, "overview", from, to] as const,
  trend: (from: string, to: string, granularity: string) =>
    [...performanceKeys.all, "trend", from, to, granularity] as const,
  workflow: (id: number, from: string, to: string) =>
    [...performanceKeys.all, "workflow", id, from, to] as const,
  workflowTrend: (id: number, from: string, to: string, granularity: string) =>
    [...performanceKeys.all, "workflow-trend", id, from, to, granularity] as const,
  worker: (id: number, from: string, to: string) =>
    [...performanceKeys.all, "worker", id, from, to] as const,
  workersComparison: (from: string, to: string) =>
    [...performanceKeys.all, "workers-comparison", from, to] as const,
  workflowComparison: (ids: number[], from: string, to: string) =>
    [...performanceKeys.all, "workflow-comparison", ids, from, to] as const,
  alertThresholds: () => [...performanceKeys.all, "alert-thresholds"] as const,
};

/* --------------------------------------------------------------------------
   Date range helpers
   -------------------------------------------------------------------------- */

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

export type DatePreset = "7d" | "30d" | "90d";

export function presetToRange(preset: DatePreset): { from: string; to: string } {
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { from: daysAgoIso(days), to: nowIso() };
}

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch the performance overview (KPI summary + top/bottom workflows). */
export function usePerformanceOverview(from: string, to: string) {
  return useQuery({
    queryKey: performanceKeys.overview(from, to),
    queryFn: () =>
      api.get<PerformanceOverview>(
        `/performance/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

/** Fetch global time-series trend data. */
export function usePerformanceTrend(
  from: string,
  to: string,
  granularity: string = "day",
) {
  return useQuery({
    queryKey: performanceKeys.trend(from, to, granularity),
    queryFn: () =>
      api.get<PerformanceTrendPoint[]>(
        `/performance/trend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`,
      ),
  });
}

/** Fetch metrics for a specific workflow. */
export function useWorkflowPerformance(
  workflowId: number | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: performanceKeys.workflow(workflowId ?? 0, from, to),
    queryFn: () =>
      api.get<PerformanceMetric[]>(
        `/performance/workflow/${workflowId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: workflowId !== null,
  });
}

/** Fetch trend data for a specific workflow. */
export function useWorkflowTrend(
  workflowId: number | null,
  from: string,
  to: string,
  granularity: string = "day",
) {
  return useQuery({
    queryKey: performanceKeys.workflowTrend(workflowId ?? 0, from, to, granularity),
    queryFn: () =>
      api.get<PerformanceTrendPoint[]>(
        `/performance/workflow/${workflowId}/trend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`,
      ),
    enabled: workflowId !== null,
  });
}

/** Fetch performance summary for a specific worker. */
export function useWorkerPerformance(
  workerId: number | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: performanceKeys.worker(workerId ?? 0, from, to),
    queryFn: () =>
      api.get<WorkerPerformanceSummary>(
        `/performance/worker/${workerId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: workerId !== null,
  });
}

/** Compare all workers' performance. */
export function useWorkersComparison(from: string, to: string) {
  return useQuery({
    queryKey: performanceKeys.workersComparison(from, to),
    queryFn: () =>
      api.get<WorkerPerformanceSummary[]>(
        `/performance/workers/comparison?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

/** Compare selected workflows side-by-side. */
export function useWorkflowComparison(
  workflowIds: number[],
  from: string,
  to: string,
) {
  const idsParam = workflowIds.join(",");
  return useQuery({
    queryKey: performanceKeys.workflowComparison(workflowIds, from, to),
    queryFn: () =>
      api.get<WorkflowComparison>(
        `/performance/comparison?workflows=${idsParam}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: workflowIds.length >= 2,
  });
}

/** List all alert thresholds. */
export function useAlertThresholds() {
  return useQuery({
    queryKey: performanceKeys.alertThresholds(),
    queryFn: () => api.get<PerformanceAlertThreshold[]>("/performance/alerts/thresholds"),
  });
}

/** Create a new alert threshold. */
export function useCreateAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAlertThreshold) =>
      api.post<PerformanceAlertThreshold>("/performance/alerts/thresholds", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.alertThresholds() });
    },
  });
}

/** Update an alert threshold. */
export function useUpdateAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAlertThreshold }) =>
      api.put<PerformanceAlertThreshold>(`/performance/alerts/thresholds/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.alertThresholds() });
    },
  });
}

/** Delete an alert threshold. */
export function useDeleteAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/performance/alerts/thresholds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.alertThresholds() });
    },
  });
}
