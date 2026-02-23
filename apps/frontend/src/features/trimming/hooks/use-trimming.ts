/**
 * Trimming TanStack Query hooks (PRD-78).
 *
 * Provides hooks for creating, reverting, batch-applying, and querying
 * segment trims with frame-accurate in/out points.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ApplyPresetRequest,
  BatchTrimRequest,
  BatchTrimResponse,
  CreateTrimRequest,
  SeedFrameUpdate,
  SegmentTrim,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const trimmingKeys = {
  all: ["trims"] as const,
  activeTrim: (segmentId: number) =>
    ["trims", "active", segmentId] as const,
  seedImpact: (segmentId: number) =>
    ["trims", "seed-impact", segmentId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the active (most recent) trim for a segment. */
export function useActiveTrim(segmentId: number) {
  return useQuery({
    queryKey: trimmingKeys.activeTrim(segmentId),
    queryFn: () =>
      api.get<SegmentTrim | null>(`/segments/${segmentId}/trim`),
    enabled: segmentId > 0,
  });
}

/** Check the downstream seed frame impact of a trim. */
export function useSeedFrameImpact(segmentId: number) {
  return useQuery({
    queryKey: trimmingKeys.seedImpact(segmentId),
    queryFn: () =>
      api.get<SeedFrameUpdate>(`/segments/${segmentId}/trim/seed-impact`),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new trim for a segment. */
export function useCreateTrim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTrimRequest) =>
      api.post<SegmentTrim>(
        `/segments/${input.segment_id}/trim`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.activeTrim(variables.segment_id),
      });
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.seedImpact(variables.segment_id),
      });
    },
  });
}

/** Revert (delete) the active trim for a segment. */
export function useRevertTrim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (segmentId: number) =>
      api.delete(`/segments/${segmentId}/trim`),
    onSuccess: (_data, segmentId) => {
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.activeTrim(segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.seedImpact(segmentId),
      });
    },
  });
}

/** Apply the same trim to multiple segments at once. */
export function useBatchTrim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchTrimRequest) =>
      api.post<BatchTrimResponse>("/trims/batch", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.all,
      });
    },
  });
}

/** Apply a quick trim preset to a segment. */
export function useApplyPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApplyPresetRequest) =>
      api.post<SegmentTrim>("/trims/preset", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.activeTrim(variables.segment_id),
      });
      queryClient.invalidateQueries({
        queryKey: trimmingKeys.seedImpact(variables.segment_id),
      });
    },
  });
}
