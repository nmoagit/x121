/**
 * TanStack Query hooks for render queue timeline / Gantt view (PRD-90).
 *
 * Follows the key factory pattern used throughout the codebase.
 *
 * Reorder uses the existing `PUT /admin/queue/reorder` endpoint from PRD-08
 * rather than creating a duplicate endpoint (DRY audit finding).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queueKeys } from "@/features/queue";
import { api } from "@/lib/api";
import type { TimelineData, ZoomLevel } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const timelineKeys = {
  all: ["render-timeline"] as const,
  timeline: (zoom: ZoomLevel) => [...timelineKeys.all, "timeline", zoom] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Timeline polling interval: 5 seconds for near-real-time updates. */
const TIMELINE_POLL_MS = 5_000;

/* --------------------------------------------------------------------------
   Timeline data
   -------------------------------------------------------------------------- */

/** Fetches the timeline data with worker lanes and jobs for the given zoom level. */
export function useTimeline(zoom: ZoomLevel) {
  return useQuery({
    queryKey: timelineKeys.timeline(zoom),
    queryFn: () => api.get<TimelineData>(`/queue/timeline?zoom=${zoom}`),
    refetchInterval: TIMELINE_POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Reorder job (admin mutation)
   -------------------------------------------------------------------------- */

/**
 * Reorder a job's priority from the timeline view.
 *
 * Uses the existing PUT /admin/queue/reorder endpoint from PRD-08 (queue.rs)
 * instead of creating a duplicate POST endpoint.
 * Invalidates both timeline and queue queries to keep both views in sync.
 */
export function useReorderJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { job_id: number; new_priority: number }) =>
      api.put<unknown>("/admin/queue/reorder", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timelineKeys.all });
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
