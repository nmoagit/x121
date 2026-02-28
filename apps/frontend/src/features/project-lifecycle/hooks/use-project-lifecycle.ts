/**
 * TanStack Query hooks for project lifecycle & archival (PRD-72).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  BulkArchiveRequest,
  BulkArchiveResponse,
  ChecklistResult,
  LifecycleState,
  ProjectSummary,
  TransitionRequest,
  TransitionResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const lifecycleKeys = {
  all: ["project-lifecycle"] as const,
  checklist: (projectId: number) =>
    [...lifecycleKeys.all, "checklist", projectId] as const,
  summary: (projectId: number) =>
    [...lifecycleKeys.all, "summary", projectId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch delivery completion checklist for a project. */
export function useCompletionChecklist(projectId: number) {
  return useQuery({
    queryKey: lifecycleKeys.checklist(projectId),
    queryFn: () =>
      api.get<ChecklistResult>(`/projects/${projectId}/checklist`),
    enabled: projectId > 0,
  });
}

/** Fetch the summary report for a project. */
export function useProjectSummary(projectId: number) {
  return useQuery({
    queryKey: lifecycleKeys.summary(projectId),
    queryFn: () =>
      api.get<ProjectSummary>(`/projects/${projectId}/summary`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Transition a project to a new lifecycle state. */
export function useTransitionProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      targetState,
      body,
    }: {
      projectId: number;
      targetState: LifecycleState;
      body?: TransitionRequest;
    }) =>
      api.post<TransitionResponse>(
        `/projects/${projectId}/transition/${targetState}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lifecycleKeys.all });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["projects", "detail", variables.projectId],
      });
    },
  });
}

/** Bulk-archive multiple delivered projects. */
export function useBulkArchive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkArchiveRequest) =>
      api.post<BulkArchiveResponse>("/projects/bulk-archive", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lifecycleKeys.all });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
