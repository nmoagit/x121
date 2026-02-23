/**
 * TanStack Query hooks for Incremental Re-stitching & Smoothing (PRD-25).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BoundaryCheckResult,
  ClearStaleResponse,
  RegenerateRequest,
  RegenerateResponse,
  SegmentVersionInfo,
  SmoothBoundaryRequest,
  SmoothBoundaryResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const restitchingKeys = {
  all: ["restitching"] as const,
  boundaryCheck: (segmentId: number) =>
    [...restitchingKeys.all, "boundary-check", segmentId] as const,
  versions: (segmentId: number) =>
    [...restitchingKeys.all, "versions", segmentId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch boundary SSIM check results for a segment. */
export function useBoundaryCheck(segmentId: number) {
  return useQuery({
    queryKey: restitchingKeys.boundaryCheck(segmentId),
    queryFn: () =>
      api.get<BoundaryCheckResult>(`/segments/${segmentId}/boundary-check`),
    enabled: segmentId > 0,
  });
}

/** Fetch version history for a segment position. */
export function useSegmentVersions(segmentId: number) {
  return useQuery({
    queryKey: restitchingKeys.versions(segmentId),
    queryFn: () =>
      api.get<SegmentVersionInfo[]>(`/segments/${segmentId}/versions`),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Regenerate a single segment. */
export function useRegenerateSegment(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegenerateRequest) =>
      api.post<RegenerateResponse>(
        `/segments/${segmentId}/regenerate`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: restitchingKeys.all,
      });
    },
  });
}

/** Apply boundary smoothing to a segment. */
export function useSmoothBoundary(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SmoothBoundaryRequest) =>
      api.post<SmoothBoundaryResponse>(
        `/segments/${segmentId}/smooth-boundary`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: restitchingKeys.boundaryCheck(segmentId),
      });
    },
  });
}

/** Clear the stale flag on a segment. */
export function useClearStale(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.patch<ClearStaleResponse>(
        `/segments/${segmentId}/clear-stale`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: restitchingKeys.all,
      });
    },
  });
}
