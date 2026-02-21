import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface WorkerCurrentMetrics {
  worker_id: number;
  gpu_index: number;
  vram_used_mb: number;
  vram_total_mb: number;
  temperature_celsius: number;
  utilization_percent: number;
  power_draw_watts: number | null;
  fan_speed_percent: number | null;
  recorded_at: string;
}

export interface GpuMetricRow {
  id: number;
  worker_id: number;
  gpu_index: number;
  vram_used_mb: number;
  vram_total_mb: number;
  temperature_celsius: number;
  utilization_percent: number;
  power_draw_watts: number | null;
  fan_speed_percent: number | null;
  recorded_at: string;
  created_at: string;
}

export interface MetricThreshold {
  id: number;
  worker_id: number | null;
  metric_name: string;
  warning_value: number;
  critical_value: number;
  is_enabled: boolean;
}

export interface RestartLog {
  id: number;
  worker_id: number;
  service_name: string;
  initiated_by: number;
  status_id: number;
  status_name: string;
  reason: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface RestartServiceRequest {
  service_name: string;
  reason?: string;
  force: boolean;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const hardwareKeys = {
  all: ["hardware"] as const,
  currentMetrics: () => [...hardwareKeys.all, "current-metrics"] as const,
  workerMetrics: (workerId: number, since: string) =>
    [...hardwareKeys.all, "worker-metrics", workerId, since] as const,
  thresholds: () => [...hardwareKeys.all, "thresholds"] as const,
  restartLogs: (workerId: number) => [...hardwareKeys.all, "restart-logs", workerId] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 5_000;

/** Fetches latest metrics for all workers. Auto-refreshes every 5 seconds. */
export function useCurrentMetrics() {
  return useQuery({
    queryKey: hardwareKeys.currentMetrics(),
    queryFn: () => api.get<WorkerCurrentMetrics[]>("/admin/hardware/workers/metrics/current"),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** Fetches historical metrics for a specific worker since a given ISO timestamp. */
export function useWorkerMetrics(workerId: number | null, since: string) {
  return useQuery({
    queryKey: hardwareKeys.workerMetrics(workerId ?? 0, since),
    queryFn: () =>
      api.get<GpuMetricRow[]>(`/admin/hardware/workers/${workerId}/metrics?since=${since}`),
    enabled: workerId !== null,
  });
}

/** Fetches all metric thresholds (global and per-worker). */
export function useThresholds() {
  return useQuery({
    queryKey: hardwareKeys.thresholds(),
    queryFn: () => api.get<MetricThreshold[]>("/admin/hardware/thresholds"),
  });
}

/** Mutation to restart a service on a specific worker. */
export function useRestartService(workerId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RestartServiceRequest) =>
      api.post<RestartLog>(`/admin/hardware/workers/${workerId}/restart`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hardwareKeys.restartLogs(workerId) });
    },
  });
}

/** Fetches restart history for a specific worker. */
export function useRestartLogs(workerId: number | null) {
  return useQuery({
    queryKey: hardwareKeys.restartLogs(workerId ?? 0),
    queryFn: () => api.get<RestartLog[]>(`/admin/hardware/workers/${workerId}/restarts`),
    enabled: workerId !== null,
  });
}
