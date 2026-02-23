/**
 * Config templates TanStack Query hooks (PRD-74).
 *
 * Provides hooks for CRUD operations on project configuration templates,
 * exporting, importing, and diffing.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ConfigDiffEntry,
  CreateProjectConfig,
  ImportConfigRequest,
  ImportResult,
  ProjectConfig,
  UpdateProjectConfig,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const configTemplateKeys = {
  all: ["project-configs"] as const,
  list: (params?: { limit?: number; offset?: number }) =>
    ["project-configs", "list", params ?? {}] as const,
  detail: (id: number) => ["project-configs", "detail", id] as const,
  recommended: () => ["project-configs", "recommended"] as const,
  diff: (configId: number, projectId: number) =>
    ["project-configs", "diff", configId, projectId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List project configs with optional pagination. */
export function useConfigTemplates(params?: {
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.limit != null) searchParams.set("limit", String(params.limit));
  if (params?.offset != null)
    searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  const url = qs ? `/project-configs?${qs}` : "/project-configs";

  return useQuery({
    queryKey: configTemplateKeys.list(params),
    queryFn: () => api.get<ProjectConfig[]>(url),
  });
}

/** List recommended project configs. */
export function useRecommendedConfigs() {
  return useQuery({
    queryKey: configTemplateKeys.recommended(),
    queryFn: () => api.get<ProjectConfig[]>("/project-configs/recommended"),
  });
}

/** Fetch a single project config by ID. */
export function useConfigTemplate(id: number) {
  return useQuery({
    queryKey: configTemplateKeys.detail(id),
    queryFn: () => api.get<ProjectConfig>(`/project-configs/${id}`),
    enabled: id > 0,
  });
}

/** Fetch a config diff between a template and a project. */
export function useConfigDiff(configId: number, projectId: number) {
  return useQuery({
    queryKey: configTemplateKeys.diff(configId, projectId),
    queryFn: () =>
      api.post<ConfigDiffEntry[]>(
        `/project-configs/${configId}/diff/${projectId}`,
      ),
    enabled: configId > 0 && projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new project config. */
export function useCreateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectConfig) =>
      api.post<ProjectConfig>("/project-configs", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configTemplateKeys.all });
    },
  });
}

/** Update an existing project config. */
export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProjectConfig & { id: number }) =>
      api.put<ProjectConfig>(`/project-configs/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configTemplateKeys.all });
    },
  });
}

/** Delete a project config. */
export function useDeleteConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/project-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configTemplateKeys.all });
    },
  });
}

/** Export a project's current configuration. */
export function useExportConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) =>
      api.post<Record<string, unknown>>(
        `/projects/${projectId}/export-config`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configTemplateKeys.all });
    },
  });
}

/** Import a config template into a project. */
export function useImportConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportConfigRequest) =>
      api.post<ImportResult>("/project-configs/import", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configTemplateKeys.all });
    },
  });
}
