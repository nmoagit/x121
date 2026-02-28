/**
 * TanStack Query hooks for Batch Review & Approval Workflows (PRD-92).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AutoApproveInput,
  BatchActionResponse,
  BatchApproveInput,
  BatchRejectInput,
  CreateAssignmentInput,
  ReviewAssignment,
  ReviewProgressResponse,
  ReviewSession,
  UpdateAssignmentInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const batchReviewKeys = {
  all: ["batch-review"] as const,
  assignments: (projectId: number) =>
    [...batchReviewKeys.all, "assignments", projectId] as const,
  progress: (projectId: number) =>
    [...batchReviewKeys.all, "progress", projectId] as const,
  session: () => [...batchReviewKeys.all, "session"] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetches all review assignments for a project. */
export function useAssignments(projectId: number) {
  return useQuery({
    queryKey: batchReviewKeys.assignments(projectId),
    queryFn: () =>
      api.get<ReviewAssignment[]>(`/review/assignments?project_id=${projectId}`),
    enabled: projectId > 0,
  });
}

/** Fetches the review progress summary for a project. */
export function useReviewProgress(projectId: number) {
  return useQuery({
    queryKey: batchReviewKeys.progress(projectId),
    queryFn: () =>
      api.get<ReviewProgressResponse>(`/review/progress?project_id=${projectId}`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Batch action mutations
   -------------------------------------------------------------------------- */

/** Approve multiple segments in batch. */
export function useBatchApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchApproveInput) =>
      api.post<BatchActionResponse>("/review/batch-approve", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}

/** Reject multiple segments in batch with optional reason. */
export function useBatchReject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchRejectInput) =>
      api.post<BatchActionResponse>("/review/batch-reject", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}

/** Auto-approve segments at or above a QA threshold. */
export function useAutoApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AutoApproveInput) =>
      api.post<BatchActionResponse>("/review/auto-approve", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Assignment mutations
   -------------------------------------------------------------------------- */

/** Create a new review assignment. */
export function useCreateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      api.post<ReviewAssignment>("/review/assignments", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: batchReviewKeys.assignments(variables.project_id),
      });
    },
  });
}

/** Update an existing review assignment. */
export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAssignmentInput }) =>
      api.put<ReviewAssignment>(`/review/assignments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}

/** Delete a review assignment. */
export function useDeleteAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/review/assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Session mutations
   -------------------------------------------------------------------------- */

/** Start a new review session. */
export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<ReviewSession>("/review/sessions"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.session() });
    },
  });
}

/** End an active review session. */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<ReviewSession>(`/review/sessions/${sessionId}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.session() });
      queryClient.invalidateQueries({ queryKey: batchReviewKeys.all });
    },
  });
}
