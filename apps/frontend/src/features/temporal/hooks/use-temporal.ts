/**
 * TanStack Query hooks for Temporal Continuity (PRD-26).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AnalyzeDriftInput,
  AnalyzeGrainInput,
  CreateTemporalSetting,
  NormalizeGrainInput,
  SceneTemporalSummary,
  TemporalMetric,
  TemporalSetting,
} from "../types";
import type { EnrichedTemporalMetric } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const temporalKeys = {
  all: ["temporal"] as const,
  sceneMetrics: (sceneId: number) =>
    [...temporalKeys.all, "scene-metrics", sceneId] as const,
  segmentMetric: (segmentId: number) =>
    [...temporalKeys.all, "segment-metric", segmentId] as const,
  projectSettings: (projectId: number) =>
    [...temporalKeys.all, "settings", projectId] as const,
};

/* --------------------------------------------------------------------------
   Scene-level queries
   -------------------------------------------------------------------------- */

/** Fetch all temporal metrics for a scene with enriched severity data. */
export function useSceneTemporalMetrics(sceneId: number) {
  return useQuery({
    queryKey: temporalKeys.sceneMetrics(sceneId),
    queryFn: () =>
      api.get<SceneTemporalSummary>(
        `/scenes/${sceneId}/temporal-metrics`,
      ),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Segment-level queries
   -------------------------------------------------------------------------- */

/** Fetch the temporal metric for a single segment. */
export function useSegmentTemporalMetric(segmentId: number) {
  return useQuery({
    queryKey: temporalKeys.segmentMetric(segmentId),
    queryFn: () =>
      api.get<EnrichedTemporalMetric>(
        `/segments/${segmentId}/temporal-metric`,
      ),
    enabled: segmentId > 0,
  });
}

/* --------------------------------------------------------------------------
   Analysis mutations
   -------------------------------------------------------------------------- */

/** Trigger drift analysis for a segment. */
export function useAnalyzeDrift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      ...body
    }: AnalyzeDriftInput & { segmentId: number }) =>
      api.post<TemporalMetric>(
        `/segments/${segmentId}/analyze-drift`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: temporalKeys.segmentMetric(variables.segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: temporalKeys.all,
      });
    },
  });
}

/** Trigger grain analysis for a segment. */
export function useAnalyzeGrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      ...body
    }: AnalyzeGrainInput & { segmentId: number }) =>
      api.post<TemporalMetric>(
        `/segments/${segmentId}/analyze-grain`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: temporalKeys.segmentMetric(variables.segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: temporalKeys.all,
      });
    },
  });
}

/** Apply grain normalization for a segment. */
export function useNormalizeGrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      segmentId,
      ...body
    }: NormalizeGrainInput & { segmentId: number }) =>
      api.post<TemporalMetric>(
        `/segments/${segmentId}/normalize-grain`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: temporalKeys.segmentMetric(variables.segmentId),
      });
      queryClient.invalidateQueries({
        queryKey: temporalKeys.all,
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Settings queries & mutations
   -------------------------------------------------------------------------- */

/** Fetch temporal settings for a project. */
export function useTemporalSettings(projectId: number) {
  return useQuery({
    queryKey: temporalKeys.projectSettings(projectId),
    queryFn: () =>
      api.get<TemporalSetting[]>(
        `/projects/${projectId}/temporal-settings`,
      ),
    enabled: projectId > 0,
  });
}

/** Update or create temporal settings for a project. */
export function useUpdateTemporalSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      ...body
    }: CreateTemporalSetting & { projectId: number }) =>
      api.put<TemporalSetting>(
        `/projects/${projectId}/temporal-settings`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: temporalKeys.projectSettings(variables.projectId),
      });
    },
  });
}
