/**
 * TanStack Query hooks for VFX Sidecar & Dataset Export (PRD-40).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateDatasetExportInput,
  CreateTemplateInput,
  DatasetExport,
  SidecarTemplate,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const sidecarKeys = {
  all: ["sidecar"] as const,
  templates: () => [...sidecarKeys.all, "templates"] as const,
  exports: (projectId: number) =>
    [...sidecarKeys.all, "exports", projectId] as const,
};

/* --------------------------------------------------------------------------
   Template queries
   -------------------------------------------------------------------------- */

/** Fetches all sidecar templates. */
export function useSidecarTemplates() {
  return useQuery({
    queryKey: sidecarKeys.templates(),
    queryFn: () => api.get<SidecarTemplate[]>("/sidecar-templates"),
  });
}

/* --------------------------------------------------------------------------
   Template mutations
   -------------------------------------------------------------------------- */

/** Creates a new sidecar template. */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      api.post<SidecarTemplate>("/sidecar-templates", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sidecarKeys.templates() });
    },
  });
}

/** Updates an existing sidecar template. */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: Partial<CreateTemplateInput> & { id: number }) =>
      api.put<SidecarTemplate>(`/sidecar-templates/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sidecarKeys.templates() });
    },
  });
}

/** Deletes a sidecar template. */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/sidecar-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sidecarKeys.templates() });
    },
  });
}

/* --------------------------------------------------------------------------
   Dataset export queries
   -------------------------------------------------------------------------- */

/** Fetches dataset exports for a project. */
export function useDatasetExports(projectId: number) {
  return useQuery({
    queryKey: sidecarKeys.exports(projectId),
    queryFn: () =>
      api.get<DatasetExport[]>(
        `/projects/${projectId}/dataset-exports`,
      ),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Dataset export mutations
   -------------------------------------------------------------------------- */

/** Creates a new dataset export for a project. */
export function useCreateDatasetExport(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDatasetExportInput) =>
      api.post<DatasetExport>(
        `/projects/${projectId}/dataset-exports`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sidecarKeys.exports(projectId),
      });
    },
  });
}
