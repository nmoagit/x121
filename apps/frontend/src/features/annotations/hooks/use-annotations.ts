/**
 * TanStack Query hooks for on-frame annotation & markup (PRD-70).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AnnotationSummary,
  CreateFrameAnnotation,
  DrawingObject,
  FrameAnnotation,
  UpdateFrameAnnotation,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const annotationKeys = {
  all: ["annotations"] as const,
  bySegment: (segmentId: number) =>
    [...annotationKeys.all, "segment", segmentId] as const,
  byFrame: (segmentId: number, frame: number) =>
    [...annotationKeys.all, "segment", segmentId, "frame", frame] as const,
  byUser: (segmentId: number, userId: number) =>
    [...annotationKeys.all, "segment", segmentId, "user", userId] as const,
  summary: (segmentId: number) =>
    [...annotationKeys.all, "summary", segmentId] as const,
  export: (segmentId: number, frame: number) =>
    [...annotationKeys.all, "export", segmentId, frame] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all annotations for a segment, with optional user_id/frame_number filters. */
export function useAnnotations(
  segmentId: number,
  filters?: { userId?: number; frameNumber?: number },
) {
  const params = new URLSearchParams();
  if (filters?.userId != null) params.set("user_id", String(filters.userId));
  if (filters?.frameNumber != null)
    params.set("frame_number", String(filters.frameNumber));
  const qs = params.toString();
  const path = `/segments/${segmentId}/annotations${qs ? `?${qs}` : ""}`;

  // Pick the most specific query key based on filters.
  const queryKey = filters?.frameNumber != null
    ? annotationKeys.byFrame(segmentId, filters.frameNumber)
    : filters?.userId != null
      ? annotationKeys.byUser(segmentId, filters.userId)
      : annotationKeys.bySegment(segmentId);

  return useQuery({
    queryKey,
    queryFn: () => api.get<FrameAnnotation[]>(path),
    enabled: segmentId > 0,
  });
}

/** Fetch annotations for a specific frame. */
export function useAnnotationsByFrame(segmentId: number, frame: number) {
  return useQuery({
    queryKey: annotationKeys.byFrame(segmentId, frame),
    queryFn: () =>
      api.get<FrameAnnotation[]>(
        `/segments/${segmentId}/annotations?frame_number=${frame}`,
      ),
    enabled: segmentId > 0 && frame >= 0,
  });
}

/** Fetch annotation summary for a segment. */
export function useAnnotationSummary(segmentId: number) {
  return useQuery({
    queryKey: annotationKeys.summary(segmentId),
    queryFn: () =>
      api.get<AnnotationSummary>(
        `/segments/${segmentId}/annotations/summary`,
      ),
    enabled: segmentId > 0,
  });
}

/** Fetch export data for a specific frame. */
export function useExportFrame(segmentId: number, frame: number) {
  return useQuery({
    queryKey: annotationKeys.export(segmentId, frame),
    queryFn: () =>
      api.get<DrawingObject[]>(
        `/segments/${segmentId}/annotations/export/${frame}`,
      ),
    enabled: segmentId > 0 && frame >= 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Shared invalidation after any annotation mutation (DRY-314). */
function useAnnotationInvalidation(segmentId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: annotationKeys.bySegment(segmentId),
    });
    queryClient.invalidateQueries({
      queryKey: annotationKeys.summary(segmentId),
    });
  };
}

/** Create a new frame annotation on a segment. */
export function useCreateAnnotation(segmentId: number) {
  return useMutation({
    mutationFn: (input: CreateFrameAnnotation) =>
      api.post<FrameAnnotation>(
        `/segments/${segmentId}/annotations`,
        input,
      ),
    onSuccess: useAnnotationInvalidation(segmentId),
  });
}

/** Update a frame annotation. */
export function useUpdateAnnotation(segmentId: number) {
  return useMutation({
    mutationFn: ({
      annotationId,
      input,
    }: {
      annotationId: number;
      input: UpdateFrameAnnotation;
    }) =>
      api.put<FrameAnnotation>(
        `/segments/${segmentId}/annotations/${annotationId}`,
        input,
      ),
    onSuccess: useAnnotationInvalidation(segmentId),
  });
}

/** Delete a frame annotation. */
export function useDeleteAnnotation(segmentId: number) {
  return useMutation({
    mutationFn: (annotationId: number) =>
      api.delete(`/segments/${segmentId}/annotations/${annotationId}`),
    onSuccess: useAnnotationInvalidation(segmentId),
  });
}
