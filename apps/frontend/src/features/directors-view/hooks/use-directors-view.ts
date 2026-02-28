/**
 * TanStack Query hooks for Director's View - Mobile/Tablet Review (PRD-55).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ActivityFeedItem,
  CreatePushSubscriptionInput,
  OfflineSyncAction,
  PushSubscription,
  ReviewAction,
  ReviewQueueItem,
  SyncResult,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const directorsViewKeys = {
  all: ["directors-view"] as const,
  reviewQueue: (params?: Record<string, string>) =>
    [...directorsViewKeys.all, "review-queue", params] as const,
  activityFeed: (params?: Record<string, string>) =>
    [...directorsViewKeys.all, "activity-feed", params] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetches the review queue for the current user. */
export function useReviewQueue(params?: Record<string, string>) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : "";

  return useQuery({
    queryKey: directorsViewKeys.reviewQueue(params),
    queryFn: () => api.get<ReviewQueueItem[]>(`/user/review-queue${search}`),
  });
}

/** Fetches the activity feed for the current user. */
export function useActivityFeed(params?: Record<string, string>) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : "";

  return useQuery({
    queryKey: directorsViewKeys.activityFeed(params),
    queryFn: () => api.get<ActivityFeedItem[]>(`/user/activity-feed${search}`),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Submit a review action (approve/reject/flag) on a segment. */
export function useSubmitReviewAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      action,
    }: {
      segmentId: number;
      action: ReviewAction;
    }) => api.post<void>(`/user/review-queue/${segmentId}/action`, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: directorsViewKeys.all });
    },
  });
}

/** Register a push notification subscription. */
export function useRegisterPushSubscription() {
  return useMutation({
    mutationFn: (input: CreatePushSubscriptionInput) =>
      api.post<PushSubscription>("/user/push-subscription", input),
  });
}

/** Delete a push notification subscription by endpoint. */
export function useDeletePushSubscription() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      api.raw("/user/push-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }),
  });
}

/** Sync offline-queued actions with the server. */
export function useSyncOfflineActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (actions: OfflineSyncAction[]) =>
      api.post<SyncResult>("/user/sync", { actions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: directorsViewKeys.all });
    },
  });
}
