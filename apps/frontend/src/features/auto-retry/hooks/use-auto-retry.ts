/**
 * TanStack Query hooks for smart auto-retry (PRD-71).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateRetryAttempt,
  RetryAttempt,
  RetryPolicy,
  UpdateRetryAttempt,
  UpdateRetryPolicy,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const retryPolicyKeys = {
  all: ["retry-policies"] as const,
  detail: (sceneTypeId: number) => [...retryPolicyKeys.all, sceneTypeId] as const,
};

export const retryAttemptKeys = {
  all: ["retry-attempts"] as const,
  bySegment: (segmentId: number) => [...retryAttemptKeys.all, segmentId] as const,
  detail: (segmentId: number, attemptId: number) =>
    [...retryAttemptKeys.bySegment(segmentId), attemptId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch retry policy for a scene type. */
export function useRetryPolicy(sceneTypeId: number) {
  return useQuery({
    queryKey: retryPolicyKeys.detail(sceneTypeId),
    queryFn: () => api.get<RetryPolicy>(`/scene-types/${sceneTypeId}/retry-policy`),
    enabled: sceneTypeId > 0,
  });
}

/** Fetch all retry attempts for a segment. */
export function useRetryAttempts(segmentId: number) {
  return useQuery({
    queryKey: retryAttemptKeys.bySegment(segmentId),
    queryFn: () => api.get<RetryAttempt[]>(`/segments/${segmentId}/retry-attempts`),
    enabled: segmentId > 0,
  });
}

/** Fetch a single retry attempt detail. */
export function useRetryAttempt(segmentId: number, attemptId: number) {
  return useQuery({
    queryKey: retryAttemptKeys.detail(segmentId, attemptId),
    queryFn: () => api.get<RetryAttempt>(`/segments/${segmentId}/retry-attempts/${attemptId}`),
    enabled: segmentId > 0 && attemptId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Update retry policy for a scene type. */
export function useUpdateRetryPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sceneTypeId,
      data,
    }: {
      sceneTypeId: number;
      data: UpdateRetryPolicy;
    }) => api.put<RetryPolicy>(`/scene-types/${sceneTypeId}/retry-policy`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: retryPolicyKeys.detail(variables.sceneTypeId),
      });
    },
  });
}

/** Create a retry attempt for a segment. */
export function useCreateRetryAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      data,
    }: {
      segmentId: number;
      data: CreateRetryAttempt;
    }) => api.post<RetryAttempt>(`/segments/${segmentId}/retry-attempts`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: retryAttemptKeys.bySegment(variables.segmentId),
      });
    },
  });
}

/** Update an existing retry attempt. */
export function useUpdateRetryAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      attemptId,
      data,
    }: {
      segmentId: number;
      attemptId: number;
      data: UpdateRetryAttempt;
    }) => api.put<RetryAttempt>(`/segments/${segmentId}/retry-attempts/${attemptId}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: retryAttemptKeys.bySegment(variables.segmentId),
      });
    },
  });
}

/** Select a retry attempt as the best-of-N winner. */
export function useSelectRetryAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      attemptId,
    }: {
      segmentId: number;
      attemptId: number;
    }) => api.post<RetryAttempt>(`/segments/${segmentId}/retry-attempts/${attemptId}/select`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: retryAttemptKeys.bySegment(variables.segmentId),
      });
    },
  });
}
