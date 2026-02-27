/**
 * TanStack Query hooks for naming rule management (PRD-116).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateNamingRule,
  NamingCategory,
  NamingRule,
  PreviewResult,
  TokenInfo,
  UpdateNamingRule,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const namingKeys = {
  all: ["naming"] as const,
  categories: () => [...namingKeys.all, "categories"] as const,
  categoryTokens: (id: number) => [...namingKeys.all, "categories", id, "tokens"] as const,
  rules: (projectId?: number) => [...namingKeys.all, "rules", { projectId }] as const,
  rule: (id: number) => [...namingKeys.all, "rules", id] as const,
  ruleHistory: (id: number) => [...namingKeys.all, "rules", id, "history"] as const,
  preview: (category: string, template: string) =>
    [...namingKeys.all, "preview", category, template] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all naming categories. */
export function useNamingCategories() {
  return useQuery({
    queryKey: namingKeys.categories(),
    queryFn: () => api.get<NamingCategory[]>("/admin/naming/categories"),
  });
}

/** Fetch available tokens for a specific category. */
export function useCategoryTokens(categoryId: number) {
  return useQuery({
    queryKey: namingKeys.categoryTokens(categoryId),
    queryFn: () => api.get<TokenInfo[]>(`/admin/naming/categories/${categoryId}/tokens`),
    enabled: categoryId > 0,
  });
}

/** Fetch all naming rules, optionally filtered by project. */
export function useNamingRules(projectId?: number) {
  const path = projectId
    ? `/admin/naming/rules?project_id=${projectId}`
    : "/admin/naming/rules";

  return useQuery({
    queryKey: namingKeys.rules(projectId),
    queryFn: () => api.get<NamingRule[]>(path),
  });
}

/** Preview a template resolution. Uses POST but modeled as a query with manual key. */
export function useNamingPreview(category: string, template: string) {
  return useQuery({
    queryKey: namingKeys.preview(category, template),
    queryFn: () =>
      api.post<PreviewResult>("/admin/naming/preview", {
        category,
        template,
      }),
    enabled: !!category && !!template,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new naming rule. */
export function useCreateNamingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateNamingRule) =>
      api.post<NamingRule>("/admin/naming/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: namingKeys.all });
    },
  });
}

/** Update an existing naming rule. */
export function useUpdateNamingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateNamingRule }) =>
      api.put<NamingRule>(`/admin/naming/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: namingKeys.all });
    },
  });
}

/** Delete a naming rule. */
export function useDeleteNamingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/naming/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: namingKeys.all });
    },
  });
}
