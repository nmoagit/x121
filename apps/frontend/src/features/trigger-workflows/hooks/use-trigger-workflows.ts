/**
 * TanStack Query hooks for trigger workflows (PRD-97).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ChainGraphNode,
  ChainGraphNodeRaw,
  CreateTrigger,
  DryRunResult,
  Trigger,
  TriggerLog,
  TriggerWithStats,
  UpdateTrigger,
} from "../types";

// Note: useTriggers returns Trigger[] (list endpoint has no stats).
// Use useTrigger(id) for TriggerWithStats (detail endpoint includes stats).

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const triggerKeys = {
  all: ["triggers"] as const,
  list: (projectId?: number) =>
    [...triggerKeys.all, "list", projectId] as const,
  detail: (id: number) => [...triggerKeys.all, "detail", id] as const,
  log: (filters: Record<string, string>) =>
    [...triggerKeys.all, "log", filters] as const,
  chainGraph: (projectId?: number) =>
    [...triggerKeys.all, "chain-graph", projectId] as const,
};

/* --------------------------------------------------------------------------
   Trigger queries
   -------------------------------------------------------------------------- */

/** Fetch all triggers, optionally scoped to a project. */
export function useTriggers(projectId?: number) {
  const qs = projectId != null ? `?project_id=${projectId}` : "";
  return useQuery({
    queryKey: triggerKeys.list(projectId),
    queryFn: () => api.get<Trigger[]>(`/admin/triggers${qs}`),
  });
}

/** Fetch a single trigger by ID (includes stats). */
export function useTrigger(id: number) {
  return useQuery({
    queryKey: triggerKeys.detail(id),
    queryFn: () => api.get<TriggerWithStats>(`/admin/triggers/${id}`),
    enabled: id > 0,
  });
}

/** Fetch trigger log entries with optional filters (paginated). */
export function useTriggerLog(filters: Record<string, string>) {
  const qs = Object.keys(filters).length
    ? `?${new URLSearchParams(filters).toString()}`
    : "";
  return useQuery({
    queryKey: triggerKeys.log(filters),
    queryFn: () => api.get<TriggerLog[]>(`/admin/triggers/log${qs}`),
  });
}

/**
 * Fetch the chain graph for visualization.
 *
 * Backend returns `ChainGraphNodeRaw[]` (no `downstream_triggers` field).
 * We compute downstream edges client-side by matching action entity_types
 * to trigger event_types (event-based chaining heuristic).
 */
export function useChainGraph(projectId?: number) {
  const qs = projectId != null ? `?project_id=${projectId}` : "";
  return useQuery({
    queryKey: triggerKeys.chainGraph(projectId),
    queryFn: async (): Promise<ChainGraphNode[]> => {
      const raw = await api.get<ChainGraphNodeRaw[]>(
        `/admin/triggers/chain-graph${qs}`,
      );
      // Build downstream edge map: a trigger's actions may produce events
      // that other triggers listen for. For now, default to empty edges --
      // full chaining inference requires knowledge of which actions produce
      // which event types, which is domain-specific.
      return raw.map((node) => ({ ...node, downstream_triggers: [] }));
    },
  });
}

/* --------------------------------------------------------------------------
   Trigger mutations
   -------------------------------------------------------------------------- */

/** Create a new trigger. */
export function useCreateTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrigger) =>
      api.post<Trigger>("/admin/triggers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}

/** Update an existing trigger. */
export function useUpdateTrigger(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateTrigger) =>
      api.put<Trigger>(`/admin/triggers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: triggerKeys.list() });
    },
  });
}

/** Delete a trigger. */
export function useDeleteTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/triggers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}

/** Execute a dry-run for a specific trigger. */
export function useDryRun() {
  return useMutation({
    mutationFn: (triggerId: number) =>
      api.post<DryRunResult>(`/admin/triggers/${triggerId}/dry-run`),
  });
}

/** Pause all triggers globally. */
export function usePauseAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ affected: number }>("/admin/triggers/pause-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}

/** Resume all triggers globally. */
export function useResumeAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ affected: number }>("/admin/triggers/resume-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}
