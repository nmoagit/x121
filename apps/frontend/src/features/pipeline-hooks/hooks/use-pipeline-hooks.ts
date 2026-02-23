/**
 * Pipeline hooks TanStack Query hooks (PRD-77).
 *
 * Provides hooks for CRUD operations on pipeline hooks, testing,
 * effective-hook resolution, and execution log viewing.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateHookRequest,
  EffectiveHook,
  Hook,
  HookExecutionLog,
  HookPoint,
  ScopeType,
  UpdateHookRequest,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const hookKeys = {
  all: ["hooks"] as const,
  list: (filter?: Record<string, unknown>) =>
    ["hooks", "list", filter ?? {}] as const,
  detail: (id: number) => ["hooks", "detail", id] as const,
  effective: (scopeType: ScopeType, scopeId: number, hookPoint?: HookPoint) =>
    ["hooks", "effective", { scopeType, scopeId, hookPoint }] as const,
  logs: (hookId: number) => ["hooks", "logs", hookId] as const,
  jobLogs: (jobId: number) => ["hooks", "jobLogs", jobId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List hooks with optional filtering. */
export function useHooks(filter?: {
  scope_type?: ScopeType;
  scope_id?: number;
  hook_point?: HookPoint;
  enabled?: boolean;
}) {
  const params = new URLSearchParams();
  if (filter?.scope_type) params.set("scope_type", filter.scope_type);
  if (filter?.scope_id != null) params.set("scope_id", String(filter.scope_id));
  if (filter?.hook_point) params.set("hook_point", filter.hook_point);
  if (filter?.enabled != null) params.set("enabled", String(filter.enabled));

  const qs = params.toString();
  const url = qs ? `/hooks?${qs}` : "/hooks";

  return useQuery({
    queryKey: hookKeys.list(filter as Record<string, unknown> | undefined),
    queryFn: () => api.get<Hook[]>(url),
  });
}

/** Fetch a single hook by ID. */
export function useHook(id: number) {
  return useQuery({
    queryKey: hookKeys.detail(id),
    queryFn: () => api.get<Hook>(`/hooks/${id}`),
    enabled: id > 0,
  });
}

/** Fetch effective (inheritance-resolved) hooks for a scope. */
export function useEffectiveHooks(
  scopeType: ScopeType,
  scopeId: number,
  hookPoint?: HookPoint,
) {
  const params = new URLSearchParams();
  if (hookPoint) params.set("hook_point", hookPoint);
  const qs = params.toString();
  const url = qs
    ? `/hooks/effective/${scopeType}/${scopeId}?${qs}`
    : `/hooks/effective/${scopeType}/${scopeId}`;

  return useQuery({
    queryKey: hookKeys.effective(scopeType, scopeId, hookPoint),
    queryFn: () => api.get<EffectiveHook[]>(url),
    enabled: scopeId > 0,
  });
}

/** List execution logs for a specific hook. */
export function useHookLogs(hookId: number) {
  return useQuery({
    queryKey: hookKeys.logs(hookId),
    queryFn: () => api.get<HookExecutionLog[]>(`/hooks/${hookId}/logs`),
    enabled: hookId > 0,
  });
}

/** List hook execution logs for a specific job. */
export function useJobHookLogs(jobId: number) {
  return useQuery({
    queryKey: hookKeys.jobLogs(jobId),
    queryFn: () => api.get<HookExecutionLog[]>(`/jobs/${jobId}/hook-logs`),
    enabled: jobId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new hook. */
export function useCreateHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHookRequest) =>
      api.post<Hook>("/hooks", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hookKeys.all });
    },
  });
}

/** Update an existing hook. */
export function useUpdateHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateHookRequest & { id: number }) =>
      api.put<Hook>(`/hooks/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hookKeys.all });
    },
  });
}

/** Delete a hook. */
export function useDeleteHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/hooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hookKeys.all });
    },
  });
}

/** Toggle a hook's enabled state. */
export function useToggleHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.patch<Hook>(`/hooks/${id}/toggle`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hookKeys.all });
    },
  });
}

/** Test a hook with sample data. */
export function useTestHook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input_json,
      job_id,
    }: {
      id: number;
      input_json?: Record<string, unknown> | null;
      job_id?: number | null;
    }) => api.post<HookExecutionLog>(`/hooks/${id}/test`, { input_json, job_id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: hookKeys.logs(variables.id),
      });
    },
  });
}
