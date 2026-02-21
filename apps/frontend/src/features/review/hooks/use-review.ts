/**
 * TanStack Query hooks for segment review workflow (PRD-35).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ApproveInput,
  FlagInput,
  RejectionCategory,
  RejectInput,
  ReviewQueueItem,
  SegmentApproval,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const reviewKeys = {
  all: ["review"] as const,
  queue: (sceneId: number) => [...reviewKeys.all, "queue", sceneId] as const,
  approvals: (segmentId: number) =>
    [...reviewKeys.all, "approvals", segmentId] as const,
  rejectionCategories: () =>
    [...reviewKeys.all, "rejection-categories"] as const,
};

/* --------------------------------------------------------------------------
   Review queue
   -------------------------------------------------------------------------- */

/** Fetches the review queue for a scene (all segments with approval status). */
export function useReviewQueue(sceneId: number) {
  return useQuery({
    queryKey: reviewKeys.queue(sceneId),
    queryFn: () =>
      api.get<ReviewQueueItem[]>(`/scenes/${sceneId}/review-queue`),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Segment approvals
   -------------------------------------------------------------------------- */

/** Fetches all approval decisions for a specific segment. */
export function useSegmentApprovals(segmentId: number) {
  return useQuery({
    queryKey: reviewKeys.approvals(segmentId),
    queryFn: () =>
      api.get<SegmentApproval[]>(`/segments/${segmentId}/approvals`),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Rejection categories
   -------------------------------------------------------------------------- */

/** Fetches all available rejection categories. */
export function useRejectionCategories() {
  return useQuery({
    queryKey: reviewKeys.rejectionCategories(),
    queryFn: () => api.get<RejectionCategory[]>("/rejection-categories"),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Shared invalidation callback for all decision mutations. */
function useDecisionMutation<TInput>(
  action: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      input,
    }: {
      segmentId: number;
      input: TInput;
    }) => api.post<SegmentApproval>(`/segments/${segmentId}/${action}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: reviewKeys.approvals(variables.segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: reviewKeys.all,
      });
    },
  });
}

/** Approve a segment. */
export function useApproveSegment() {
  return useDecisionMutation<ApproveInput>("approve");
}

/** Reject a segment with optional category and comment. */
export function useRejectSegment() {
  return useDecisionMutation<RejectInput>("reject");
}

/** Flag a segment for discussion. */
export function useFlagSegment() {
  return useDecisionMutation<FlagInput>("flag");
}
