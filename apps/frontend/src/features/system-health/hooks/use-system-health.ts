/**
 * TanStack Query hooks for system health monitoring (PRD-80).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  HealthAlertConfig,
  ServiceStatusResponse,
  StartupCheckResult,
  UpdateAlertConfigInput,
  UptimeResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const healthKeys = {
  all: ["system-health"] as const,
  statuses: () => [...healthKeys.all, "statuses"] as const,
  service: (name: string) => [...healthKeys.all, "service", name] as const,
  uptime: () => [...healthKeys.all, "uptime"] as const,
  checklist: () => [...healthKeys.all, "checklist"] as const,
  alerts: () => [...healthKeys.all, "alerts"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Service status polling interval: 30 seconds. */
const STATUS_POLL_MS = 30_000;

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch current status for all services. Auto-refreshes every 30s. */
export function useServiceStatuses() {
  return useQuery({
    queryKey: healthKeys.statuses(),
    queryFn: () => api.get<ServiceStatusResponse[]>("/admin/health/statuses"),
    refetchInterval: STATUS_POLL_MS,
  });
}

/** Fetch detailed health info for a single service by name. */
export function useServiceDetail(name: string) {
  return useQuery({
    queryKey: healthKeys.service(name),
    queryFn: () => api.get<ServiceStatusResponse>(`/admin/health/services/${name}`),
    enabled: !!name,
  });
}

/** Fetch uptime statistics for all services. */
export function useUptime() {
  return useQuery({
    queryKey: healthKeys.uptime(),
    queryFn: () => api.get<UptimeResponse[]>("/admin/health/uptime"),
  });
}

/** Fetch startup readiness checklist. */
export function useStartupChecklist() {
  return useQuery({
    queryKey: healthKeys.checklist(),
    queryFn: () => api.get<StartupCheckResult>("/admin/health/startup"),
  });
}

/** Fetch all alert configurations. */
export function useAlertConfigs() {
  return useQuery({
    queryKey: healthKeys.alerts(),
    queryFn: () => api.get<HealthAlertConfig[]>("/admin/health/alerts"),
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Trigger a health re-check for a specific service. */
export function useRecheckService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceName: string) =>
      api.post<ServiceStatusResponse>(`/admin/health/recheck/${serviceName}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: healthKeys.statuses() });
    },
  });
}

/** Update an alert configuration for a service (upsert by service name). */
export function useUpdateAlertConfig(serviceName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAlertConfigInput) =>
      api.put<HealthAlertConfig>(`/admin/health/alerts/${serviceName}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: healthKeys.alerts() });
    },
  });
}
