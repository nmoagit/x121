/**
 * TanStack Query hooks for worker pool management (PRD-46).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateWorker,
  FleetStats,
  HealthLogEntry,
  UpdateWorker,
  Worker,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const workerKeys = {
  all: ["workers"] as const,
  list: () => [...workerKeys.all, "list"] as const,
  detail: (id: number) => [...workerKeys.all, "detail", id] as const,
  stats: () => [...workerKeys.all, "stats"] as const,
  healthLog: (id: number) => [...workerKeys.all, "health-log", id] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Worker list polling interval: 15 seconds. */
const WORKER_POLL_MS = 15_000;

/** Fleet stats polling interval: 30 seconds. */
const STATS_POLL_MS = 30_000;

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all workers (admin view). Auto-refreshes every 15s. */
export function useWorkers() {
  return useQuery({
    queryKey: workerKeys.list(),
    queryFn: () => api.get<Worker[]>("/admin/workers"),
    refetchInterval: WORKER_POLL_MS,
  });
}

/** Fetch a single worker by ID. */
export function useWorker(id: number) {
  return useQuery({
    queryKey: workerKeys.detail(id),
    queryFn: () => api.get<Worker>(`/admin/workers/${id}`),
    enabled: id > 0,
  });
}

/** Fetch fleet-level aggregate statistics. Auto-refreshes every 30s. */
export function useFleetStats() {
  return useQuery({
    queryKey: workerKeys.stats(),
    queryFn: () => api.get<FleetStats>("/admin/workers/stats"),
    refetchInterval: STATS_POLL_MS,
  });
}

/** Fetch health-log entries for a worker. */
export function useWorkerHealthLog(workerId: number) {
  return useQuery({
    queryKey: workerKeys.healthLog(workerId),
    queryFn: () =>
      api.get<HealthLogEntry[]>(`/admin/workers/${workerId}/health-log`),
    enabled: workerId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Register a new worker (admin). */
export function useRegisterWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorker) =>
      api.post<Worker>("/admin/workers", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerKeys.list() });
      qc.invalidateQueries({ queryKey: workerKeys.stats() });
    },
  });
}

/** Update a worker. */
export function useUpdateWorker(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorker) =>
      api.put<Worker>(`/admin/workers/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerKeys.detail(id) });
      qc.invalidateQueries({ queryKey: workerKeys.list() });
    },
  });
}

/** Approve a worker for receiving jobs. */
export function useApproveWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<Worker>(`/admin/workers/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerKeys.all });
    },
  });
}

/** Set a worker to draining status. */
export function useDrainWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<Worker>(`/admin/workers/${id}/drain`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerKeys.all });
    },
  });
}

/** Decommission a worker. */
export function useDecommissionWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<void>(`/admin/workers/${id}/decommission`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workerKeys.all });
    },
  });
}
