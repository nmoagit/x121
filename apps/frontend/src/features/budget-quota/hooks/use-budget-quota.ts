/**
 * TanStack Query hooks for Generation Budget & Quota Management (PRD-93).
 *
 * Follows the key factory pattern used throughout the codebase.
 *
 * Backend route mounts (see routes/mod.rs):
 * - /admin/budgets              -> admin_budget_router
 * - /admin/quotas               -> admin_quota_router
 * - /admin/budget-exemptions    -> admin_exemption_router
 * - /budgets                    -> user_router
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BudgetCheckResult,
  BudgetExemption,
  BudgetStatus,
  CreateBudgetExemption,
  CreateProjectBudget,
  CreateUserQuota,
  DailyConsumption,
  ProjectBudget,
  QuotaStatus,
  UpdateBudgetExemption,
  UpdateProjectBudget,
  UpdateUserQuota,
  UserQuota,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const budgetKeys = {
  all: ["budgets"] as const,
  budgets: () => [...budgetKeys.all, "budgets"] as const,
  budget: (projectId: number) =>
    [...budgetKeys.all, "budget", projectId] as const,
  quotas: () => [...budgetKeys.all, "quotas"] as const,
  quota: (userId: number) => [...budgetKeys.all, "quota", userId] as const,
  exemptions: () => [...budgetKeys.all, "exemptions"] as const,
  myBudget: (projectId: number) =>
    [...budgetKeys.all, "my-budget", projectId] as const,
  myQuota: () => [...budgetKeys.all, "my-quota"] as const,
  check: (projectId: number, hours: number) =>
    [...budgetKeys.all, "check", projectId, hours] as const,
  budgetHistory: (projectId: number, period: string) =>
    [...budgetKeys.all, "budget-history", projectId, period] as const,
  quotaHistory: (userId: number, period: string) =>
    [...budgetKeys.all, "quota-history", userId, period] as const,
};

/* --------------------------------------------------------------------------
   Admin: Budget queries
   -------------------------------------------------------------------------- */

/** GET /admin/budgets -- list all project budgets. */
export function useBudgets() {
  return useQuery({
    queryKey: budgetKeys.budgets(),
    queryFn: () => api.get<ProjectBudget[]>("/admin/budgets"),
  });
}

/** GET /admin/budgets/:projectId -- get single budget with trend projection. */
export function useBudget(projectId: number) {
  return useQuery({
    queryKey: budgetKeys.budget(projectId),
    queryFn: () => api.get<BudgetStatus>(`/admin/budgets/${projectId}`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Admin: Budget mutations
   -------------------------------------------------------------------------- */

/** PUT /admin/budgets/:projectId -- create or update a project budget. */
export function useUpsertBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: number;
      data: CreateProjectBudget | UpdateProjectBudget;
    }) => api.put<ProjectBudget>(`/admin/budgets/${projectId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

/** DELETE /admin/budgets/:projectId -- remove a project budget. */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) =>
      api.delete(`/admin/budgets/${projectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: Quota queries
   -------------------------------------------------------------------------- */

/** GET /admin/quotas -- list all user quotas. */
export function useQuotas() {
  return useQuery({
    queryKey: budgetKeys.quotas(),
    queryFn: () => api.get<UserQuota[]>("/admin/quotas"),
  });
}

/** GET /admin/quotas/:userId -- get single user quota with status. */
export function useQuota(userId: number) {
  return useQuery({
    queryKey: budgetKeys.quota(userId),
    queryFn: () => api.get<QuotaStatus>(`/admin/quotas/${userId}`),
    enabled: userId > 0,
  });
}

/* --------------------------------------------------------------------------
   Admin: Quota mutations
   -------------------------------------------------------------------------- */

/** PUT /admin/quotas/:userId -- create or update a user quota. */
export function useUpsertQuota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: number;
      data: CreateUserQuota | UpdateUserQuota;
    }) => api.put<UserQuota>(`/admin/quotas/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

/** DELETE /admin/quotas/:userId -- remove a user quota. */
export function useDeleteQuota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: number) => api.delete(`/admin/quotas/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Admin: Exemption queries
   -------------------------------------------------------------------------- */

/** GET /admin/budget-exemptions -- list all budget exemptions. */
export function useExemptions() {
  return useQuery({
    queryKey: budgetKeys.exemptions(),
    queryFn: () => api.get<BudgetExemption[]>("/admin/budget-exemptions"),
  });
}

/* --------------------------------------------------------------------------
   Admin: Exemption mutations
   -------------------------------------------------------------------------- */

/** POST /admin/budget-exemptions -- create a new exemption rule. */
export function useCreateExemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBudgetExemption) =>
      api.post<BudgetExemption>("/admin/budget-exemptions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.exemptions() });
    },
  });
}

/** PUT /admin/budget-exemptions/:id -- update an exemption rule. */
export function useUpdateExemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBudgetExemption }) =>
      api.put<BudgetExemption>(`/admin/budget-exemptions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.exemptions() });
    },
  });
}

/** DELETE /admin/budget-exemptions/:id -- remove an exemption rule. */
export function useDeleteExemption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/budget-exemptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.exemptions() });
    },
  });
}

/* --------------------------------------------------------------------------
   User: Budget & quota status
   -------------------------------------------------------------------------- */

/** GET /budgets/my-project/:projectId -- current user's budget status. */
export function useMyBudget(projectId: number) {
  return useQuery({
    queryKey: budgetKeys.myBudget(projectId),
    queryFn: () => api.get<BudgetStatus>(`/budgets/my-project/${projectId}`),
    enabled: projectId > 0,
  });
}

/** GET /budgets/my-quota -- current user's quota status. */
export function useMyQuota() {
  return useQuery({
    queryKey: budgetKeys.myQuota(),
    queryFn: () => api.get<QuotaStatus>("/budgets/my-quota"),
  });
}

/* --------------------------------------------------------------------------
   User: Pre-submission budget check
   -------------------------------------------------------------------------- */

/** GET /budgets/check?project_id=N&estimated_hours=N -- check if a job can proceed. */
export function useBudgetCheck(projectId: number, estimatedHours: number) {
  return useQuery({
    queryKey: budgetKeys.check(projectId, estimatedHours),
    queryFn: () =>
      api.get<BudgetCheckResult>(
        `/budgets/check?project_id=${projectId}&estimated_hours=${estimatedHours}`,
      ),
    enabled: projectId > 0 && estimatedHours > 0,
  });
}

/* --------------------------------------------------------------------------
   Consumption history (admin)
   -------------------------------------------------------------------------- */

/** GET /admin/budgets/:projectId/history?period=30d -- project consumption over time. */
export function useBudgetHistory(projectId: number, period = "30d") {
  return useQuery({
    queryKey: budgetKeys.budgetHistory(projectId, period),
    queryFn: () =>
      api.get<DailyConsumption[]>(
        `/admin/budgets/${projectId}/history?period=${period}`,
      ),
    enabled: projectId > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

/** GET /admin/quotas/:userId/history?period=7d -- user consumption over time. */
export function useQuotaHistory(userId: number, period = "7d") {
  return useQuery({
    queryKey: budgetKeys.quotaHistory(userId, period),
    queryFn: () =>
      api.get<DailyConsumption[]>(
        `/admin/quotas/${userId}/history?period=${period}`,
      ),
    enabled: userId > 0,
    staleTime: 60 * 1000,
  });
}
