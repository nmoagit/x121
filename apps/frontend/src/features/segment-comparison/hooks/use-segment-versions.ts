/**
 * TanStack Query hooks for segment version history and comparison (PRD-101).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { SegmentVersion, VersionComparison } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const segmentVersionKeys = {
  all: ["segment-versions"] as const,
  history: (segmentId: number) => [...segmentVersionKeys.all, "history", segmentId] as const,
  compare: (segmentId: number, v1: number, v2: number) =>
    [...segmentVersionKeys.all, "compare", segmentId, v1, v2] as const,
  detail: (segmentId: number, versionId: number) =>
    [...segmentVersionKeys.all, "detail", segmentId, versionId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/**
 * Fetches the full version history for a segment.
 *
 * GET /api/v1/segments/{id}/version-history
 */
export function useVersionHistory(segmentId: number) {
  return useQuery({
    queryKey: segmentVersionKeys.history(segmentId),
    queryFn: () => api.get<SegmentVersion[]>(`/segments/${segmentId}/version-history`),
    enabled: segmentId > 0,
  });
}

/**
 * Fetches a side-by-side comparison between two versions.
 *
 * GET /api/v1/segments/{id}/compare?v1={v1}&v2={v2}
 */
export function useVersionComparison(segmentId: number, v1: number, v2: number) {
  return useQuery({
    queryKey: segmentVersionKeys.compare(segmentId, v1, v2),
    queryFn: () => api.get<VersionComparison>(`/segments/${segmentId}/compare?v1=${v1}&v2=${v2}`),
    enabled: segmentId > 0 && v1 > 0 && v2 > 0,
  });
}

/**
 * Fetches details for a single segment version.
 *
 * GET /api/v1/segments/{id}/versions/{versionId}
 */
export function useVersionDetail(segmentId: number, versionId: number) {
  return useQuery({
    queryKey: segmentVersionKeys.detail(segmentId, versionId),
    queryFn: () => api.get<SegmentVersion>(`/segments/${segmentId}/versions/${versionId}`),
    enabled: segmentId > 0 && versionId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/**
 * Selects a specific version as the active one for the segment.
 *
 * POST /api/v1/segments/{segmentId}/versions/{versionId}/select
 */
export function useSelectVersion(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<void>(`/segments/${segmentId}/versions/${versionId}/select`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: segmentVersionKeys.history(segmentId),
      });
    },
  });
}
