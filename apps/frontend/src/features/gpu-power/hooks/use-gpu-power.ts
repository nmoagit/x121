/**
 * TanStack Query hooks for GPU power management (PRD-87).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ConsumptionParams,
  ConsumptionSummaryData,
  CreatePowerScheduleInput,
  FleetPowerSettings,
  PowerSchedule,
  UpdateFleetPowerSettings,
  UpdatePowerScheduleInput,
  WorkerPowerStatus,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const gpuPowerKeys = {
  all: ["gpu-power"] as const,
  workerStatus: (workerId: number) =>
    [...gpuPowerKeys.all, "worker-status", workerId] as const,
  fleetStatus: () => [...gpuPowerKeys.all, "fleet-status"] as const,
  fleetSettings: () => [...gpuPowerKeys.all, "fleet-settings"] as const,
  schedules: () => [...gpuPowerKeys.all, "schedules"] as const,
  schedule: (id: number) => [...gpuPowerKeys.all, "schedule", id] as const,
  consumption: (params: ConsumptionParams) =>
    [...gpuPowerKeys.all, "consumption", params] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Power status polling interval: 10 seconds. */
const POWER_POLL_MS = 10_000;

/** Fleet settings polling interval: 60 seconds. */
const SETTINGS_POLL_MS = 60_000;

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch power status for a single worker. Auto-refreshes every 10s. */
export function useWorkerPowerStatus(workerId: number) {
  return useQuery({
    queryKey: gpuPowerKeys.workerStatus(workerId),
    queryFn: () =>
      api.get<WorkerPowerStatus>(`/admin/power/workers/${workerId}/status`),
    enabled: workerId > 0,
    refetchInterval: POWER_POLL_MS,
  });
}

/** Fetch power status for all workers. Auto-refreshes every 10s. */
export function useFleetPowerStatus() {
  return useQuery({
    queryKey: gpuPowerKeys.fleetStatus(),
    queryFn: () =>
      api.get<WorkerPowerStatus[]>("/admin/power/workers/status"),
    refetchInterval: POWER_POLL_MS,
  });
}

/** Fetch fleet-wide power settings. Auto-refreshes every 60s. */
export function useFleetPowerSettings() {
  return useQuery({
    queryKey: gpuPowerKeys.fleetSettings(),
    queryFn: () =>
      api.get<FleetPowerSettings>("/admin/power/fleet"),
    refetchInterval: SETTINGS_POLL_MS,
  });
}

/** Fetch power schedules. */
export function usePowerSchedules() {
  return useQuery({
    queryKey: gpuPowerKeys.schedules(),
    queryFn: () => api.get<PowerSchedule[]>("/admin/power/schedules"),
  });
}

/** Fetch consumption summary for a date range. */
export function useConsumptionSummary(params: ConsumptionParams) {
  return useQuery({
    queryKey: gpuPowerKeys.consumption(params),
    queryFn: () => {
      const search = new URLSearchParams({
        from: params.from,
        to: params.to,
      });
      if (params.worker_id) {
        search.set("worker_id", String(params.worker_id));
      }
      return api.get<ConsumptionSummaryData>(
        `/admin/power/consumption?${search.toString()}`,
      );
    },
    enabled: !!params.from && !!params.to,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Wake a sleeping/idle worker. */
export function useWakeWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workerId: number) =>
      api.post<WorkerPowerStatus>(
        `/admin/power/workers/${workerId}/wake`,
      ),
    onSuccess: (_data, workerId) => {
      qc.invalidateQueries({ queryKey: gpuPowerKeys.workerStatus(workerId) });
      qc.invalidateQueries({ queryKey: gpuPowerKeys.fleetStatus() });
    },
  });
}

/** Shut down a worker. */
export function useShutdownWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workerId: number) =>
      api.post<WorkerPowerStatus>(
        `/admin/power/workers/${workerId}/shutdown`,
      ),
    onSuccess: (_data, workerId) => {
      qc.invalidateQueries({ queryKey: gpuPowerKeys.workerStatus(workerId) });
      qc.invalidateQueries({ queryKey: gpuPowerKeys.fleetStatus() });
    },
  });
}

/** Create or update a power schedule. */
export function useSetPowerSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { type: "create"; data: CreatePowerScheduleInput }
        | { type: "update"; id: number; data: UpdatePowerScheduleInput },
    ) => {
      if (input.type === "create") {
        return api.post<PowerSchedule>(
          "/admin/power/schedules",
          input.data,
        );
      }
      return api.put<PowerSchedule>(
        `/admin/power/schedules/${input.id}`,
        input.data,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gpuPowerKeys.schedules() });
    },
  });
}

/** Update fleet-wide power settings. */
export function useUpdateFleetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFleetPowerSettings) =>
      api.put<FleetPowerSettings>(
        "/admin/power/fleet",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gpuPowerKeys.fleetSettings() });
    },
  });
}
