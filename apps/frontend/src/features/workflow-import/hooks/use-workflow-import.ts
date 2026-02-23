/**
 * Workflow import TanStack Query hooks (PRD-75).
 *
 * Provides hooks for importing, listing, updating, validating,
 * and versioning ComfyUI workflow definitions.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ImportWorkflowRequest,
  ValidationResult,
  VersionDiffResponse,
  Workflow,
  WorkflowVersion,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const workflowKeys = {
  all: ["workflows"] as const,
  list: (statusId?: number) =>
    ["workflows", "list", { statusId }] as const,
  detail: (id: number) => ["workflows", "detail", id] as const,
  validationReport: (id: number) =>
    ["workflows", "validation-report", id] as const,
  versions: (workflowId: number) =>
    ["workflows", "versions", workflowId] as const,
  version: (workflowId: number, version: number) =>
    ["workflows", "version", workflowId, version] as const,
  diff: (workflowId: number, v1: number, v2: number) =>
    ["workflows", "diff", workflowId, v1, v2] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List workflows with optional status filter. */
export function useWorkflows(statusId?: number) {
  const params = new URLSearchParams();
  if (statusId != null) {
    params.set("status_id", String(statusId));
  }

  const qs = params.toString();
  const path = qs ? `/workflows?${qs}` : "/workflows";

  return useQuery({
    queryKey: workflowKeys.list(statusId),
    queryFn: () => api.get<Workflow[]>(path),
  });
}

/** Fetch a single workflow by ID. */
export function useWorkflow(id: number) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () => api.get<Workflow>(`/workflows/${id}/detail`),
    enabled: id > 0,
  });
}

/** Fetch the validation report for a workflow. */
export function useValidationReport(id: number) {
  return useQuery({
    queryKey: workflowKeys.validationReport(id),
    queryFn: () =>
      api.get<ValidationResult | null>(
        `/workflows/${id}/validation-report`,
      ),
    enabled: id > 0,
  });
}

/** List versions for a workflow. */
export function useWorkflowVersions(workflowId: number) {
  return useQuery({
    queryKey: workflowKeys.versions(workflowId),
    queryFn: () =>
      api.get<WorkflowVersion[]>(`/workflows/${workflowId}/versions`),
    enabled: workflowId > 0,
  });
}

/** Fetch a specific workflow version. */
export function useWorkflowVersion(workflowId: number, version: number) {
  return useQuery({
    queryKey: workflowKeys.version(workflowId, version),
    queryFn: () =>
      api.get<WorkflowVersion>(
        `/workflows/${workflowId}/versions/${version}`,
      ),
    enabled: workflowId > 0 && version > 0,
  });
}

/** Diff two workflow versions. */
export function useDiffVersions(
  workflowId: number,
  v1: number,
  v2: number,
) {
  return useQuery({
    queryKey: workflowKeys.diff(workflowId, v1, v2),
    queryFn: () =>
      api.get<VersionDiffResponse>(
        `/workflows/${workflowId}/diff?v1=${v1}&v2=${v2}`,
      ),
    enabled: workflowId > 0 && v1 > 0 && v2 > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Import a new workflow. */
export function useImportWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportWorkflowRequest) =>
      api.post<Workflow>("/workflows/import", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

/** Update an existing workflow. */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: number } & Partial<
      Pick<Workflow, "name" | "description" | "json_content" | "status_id">
    >) => api.put<Workflow>(`/workflows/${id}/detail`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

/** Delete a workflow. */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/workflows/${id}/detail`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

/** Trigger validation on a workflow. */
export function useValidateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ValidationResult>(`/workflows/${id}/validate`, {}),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(id),
      });
      queryClient.invalidateQueries({
        queryKey: workflowKeys.validationReport(id),
      });
    },
  });
}
