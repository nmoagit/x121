/**
 * TanStack Query hooks for cloud GPU provider management (PRD-114).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types (mirror backend API response shapes)
// ---------------------------------------------------------------------------

export interface CloudProvider {
  id: number;
  name: string;
  provider_type: string;
  base_url: string | null;
  settings: Record<string, unknown>;
  status_id: number;
  budget_limit_cents: number | null;
  budget_period_start: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudGpuType {
  id: number;
  provider_id: number;
  gpu_id: string;
  name: string;
  vram_mb: number;
  cost_per_hour_cents: number;
  max_gpu_count: number;
  available: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CloudInstance {
  id: number;
  provider_id: number;
  gpu_type_id: number;
  external_id: string;
  name: string | null;
  status_id: number;
  ip_address: string | null;
  ssh_port: number | null;
  gpu_count: number;
  cost_per_hour_cents: number;
  total_cost_cents: number;
  metadata: Record<string, unknown>;
  started_at: string | null;
  stopped_at: string | null;
  last_health_check: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudScalingRule {
  id: number;
  provider_id: number;
  gpu_type_id: number;
  min_instances: number;
  max_instances: number;
  queue_threshold: number;
  cooldown_secs: number;
  budget_limit_cents: number | null;
  enabled: boolean;
  last_scaled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudCostEvent {
  id: number;
  instance_id: number;
  provider_id: number;
  event_type: string;
  amount_cents: number;
  description: string | null;
  created_at: string;
}

export interface ProviderCostSummary {
  total_cost_cents: number;
  event_count: number;
}

export interface CloudDashboardStats {
  total_providers: number;
  active_providers: number;
  total_instances: number;
  running_instances: number;
  total_cost_cents: number;
}

export interface ProviderHealth {
  healthy: boolean;
  latency_ms: number;
  message: string | null;
}

export interface EmergencyStopResult {
  terminated: number;
  failed: number;
  provider_disabled: boolean;
}

export interface CloudScalingEvent {
  id: number;
  rule_id: number;
  provider_id: number;
  action: string;
  reason: string;
  instances_changed: number;
  queue_depth: number;
  current_count: number;
  budget_spent_cents: number;
  cooldown_remaining_secs: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const cloudKeys = {
  all: ["cloud-providers"] as const,
  dashboard: () => [...cloudKeys.all, "dashboard"] as const,
  list: () => [...cloudKeys.all, "list"] as const,
  detail: (id: number) => [...cloudKeys.all, "detail", id] as const,
  gpuTypes: (providerId: number) => [...cloudKeys.all, "gpu-types", providerId] as const,
  instances: (providerId: number) => [...cloudKeys.all, "instances", providerId] as const,
  scalingRules: (providerId: number) => [...cloudKeys.all, "scaling-rules", providerId] as const,
  costSummary: (providerId: number) => [...cloudKeys.all, "cost-summary", providerId] as const,
  costEvents: (providerId: number) => [...cloudKeys.all, "cost-events", providerId] as const,
  scalingEvents: (providerId: number) => [...cloudKeys.all, "scaling-events", providerId] as const,
};

const BASE = "/admin/cloud-providers";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function useCloudDashboard() {
  return useQuery({
    queryKey: cloudKeys.dashboard(),
    queryFn: () => api.get<CloudDashboardStats>(`${BASE}/dashboard`),
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Provider CRUD
// ---------------------------------------------------------------------------

export function useCloudProviders() {
  return useQuery({
    queryKey: cloudKeys.list(),
    queryFn: () => api.get<CloudProvider[]>(`${BASE}`),
  });
}

export function useCloudProvider(id: number | null) {
  return useQuery({
    queryKey: cloudKeys.detail(id ?? 0),
    queryFn: () => api.get<CloudProvider>(`${BASE}/${id}`),
    enabled: id !== null,
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      provider_type: string;
      api_key: string;
      base_url?: string;
      settings?: Record<string, unknown>;
      budget_limit_cents?: number;
    }) => api.post<CloudProvider>(`${BASE}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.all });
    },
  });
}

export function useUpdateProvider(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{
      name: string;
      api_key: string;
      base_url: string;
      settings: Record<string, unknown>;
      status_id: number;
      budget_limit_cents: number;
    }>) => api.put<CloudProvider>(`${BASE}/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.all });
    },
  });
}

export function useDeleteProvider(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(`${BASE}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.all });
    },
  });
}

export function useTestConnection(id: number) {
  return useMutation({
    mutationFn: () => api.post<ProviderHealth>(`${BASE}/${id}/test-connection`, {}),
  });
}

// ---------------------------------------------------------------------------
// GPU Types
// ---------------------------------------------------------------------------

export function useGpuTypes(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.gpuTypes(providerId ?? 0),
    queryFn: () => api.get<CloudGpuType[]>(`${BASE}/${providerId}/gpu-types`),
    enabled: providerId !== null,
  });
}

export function useSyncGpuTypes(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CloudGpuType[]>(`${BASE}/${providerId}/gpu-types/sync`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.gpuTypes(providerId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export function useInstances(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.instances(providerId ?? 0),
    queryFn: () => api.get<CloudInstance[]>(`${BASE}/${providerId}/instances`),
    enabled: providerId !== null,
    refetchInterval: 15_000,
  });
}

export function useProvisionInstance(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      gpu_type_id: number;
      name?: string;
      gpu_count?: number;
      network_volume_id?: string;
      volume_mount_path?: string;
      docker_image?: string;
      template_id?: string;
      auto_start?: boolean;
    }) => api.post<CloudInstance>(`${BASE}/${providerId}/instances/provision`, {
      auto_start: true,
      ...data,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.instances(providerId) });
      qc.invalidateQueries({ queryKey: cloudKeys.dashboard() });
    },
  });
}

export function useStartInstance(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instId: number) =>
      api.post<void>(`${BASE}/${providerId}/instances/${instId}/start`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.instances(providerId) });
    },
  });
}

export function useStopInstance(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instId: number) =>
      api.post<void>(`${BASE}/${providerId}/instances/${instId}/stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.instances(providerId) });
    },
  });
}

export function useTerminateInstance(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instId: number) =>
      api.post<void>(`${BASE}/${providerId}/instances/${instId}/terminate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.instances(providerId) });
      qc.invalidateQueries({ queryKey: cloudKeys.dashboard() });
    },
  });
}

// ---------------------------------------------------------------------------
// Scaling Rules
// ---------------------------------------------------------------------------

export function useScalingRules(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.scalingRules(providerId ?? 0),
    queryFn: () => api.get<CloudScalingRule[]>(`${BASE}/${providerId}/scaling-rules`),
    enabled: providerId !== null,
  });
}

export function useCreateScalingRule(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      gpu_type_id: number;
      min_instances?: number;
      max_instances?: number;
      queue_threshold?: number;
      cooldown_secs?: number;
      budget_limit_cents?: number;
      enabled?: boolean;
    }) => api.post<CloudScalingRule>(`${BASE}/${providerId}/scaling-rules`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.scalingRules(providerId) });
    },
  });
}

export function useUpdateScalingRule(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ruleId: number; data: Partial<CloudScalingRule> }) =>
      api.put<CloudScalingRule>(`${BASE}/${providerId}/scaling-rules/${args.ruleId}`, args.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.scalingRules(providerId) });
    },
  });
}

export function useDeleteScalingRule(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) =>
      api.delete<void>(`${BASE}/${providerId}/scaling-rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.scalingRules(providerId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Scaling Events (audit log)
// ---------------------------------------------------------------------------

export function useScalingEvents(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.scalingEvents(providerId ?? 0),
    queryFn: () => api.get<CloudScalingEvent[]>(`${BASE}/${providerId}/scaling-events?limit=100`),
    enabled: providerId !== null,
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Scaling Reset
// ---------------------------------------------------------------------------

export function useResetScaling(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`${BASE}/${providerId}/scaling-reset`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.scalingEvents(providerId) });
      qc.invalidateQueries({ queryKey: cloudKeys.scalingRules(providerId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export function useCostSummary(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.costSummary(providerId ?? 0),
    queryFn: () => api.get<ProviderCostSummary>(`${BASE}/${providerId}/cost-summary`),
    enabled: providerId !== null,
  });
}

export function useCostEvents(providerId: number | null) {
  return useQuery({
    queryKey: cloudKeys.costEvents(providerId ?? 0),
    queryFn: () => api.get<CloudCostEvent[]>(`${BASE}/${providerId}/cost-events`),
    enabled: providerId !== null,
  });
}

// ---------------------------------------------------------------------------
// Emergency Stop
// ---------------------------------------------------------------------------

export function useEmergencyStopProvider(providerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EmergencyStopResult>(`${BASE}/${providerId}/emergency-stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.all });
    },
  });
}

export function useEmergencyStopAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EmergencyStopResult>(`${BASE}/emergency-stop-all`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cloudKeys.all });
    },
  });
}
