/**
 * TanStack Query hooks for Automated Quality Gates (PRD-49).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateQaThreshold,
  QaThreshold,
  QualityScore,
  SceneQaSummary,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const qualityGateKeys = {
  all: ["quality-gates"] as const,
  segmentScores: (segmentId: number) =>
    [...qualityGateKeys.all, "segment-scores", segmentId] as const,
  sceneSummary: (sceneId: number) =>
    [...qualityGateKeys.all, "scene-summary", sceneId] as const,
  projectThresholds: (projectId: number) =>
    [...qualityGateKeys.all, "project-thresholds", projectId] as const,
  studioDefaults: () =>
    [...qualityGateKeys.all, "studio-defaults"] as const,
};

/* --------------------------------------------------------------------------
   Score queries
   -------------------------------------------------------------------------- */

/** Fetches all QA scores for a specific segment. */
export function useSegmentQaScores(segmentId: number) {
  return useQuery({
    queryKey: qualityGateKeys.segmentScores(segmentId),
    queryFn: () =>
      api.get<QualityScore[]>(`/segments/${segmentId}/qa-scores`),
    enabled: segmentId > 0,
  });
}

/** Fetches the aggregated QA summary for a scene. */
export function useSceneQaSummary(sceneId: number) {
  return useQuery({
    queryKey: qualityGateKeys.sceneSummary(sceneId),
    queryFn: () =>
      api.get<SceneQaSummary>(`/scenes/${sceneId}/qa-summary`),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Threshold queries
   -------------------------------------------------------------------------- */

/** Fetches effective thresholds for a project (project overrides + studio defaults). */
export function useProjectThresholds(projectId: number) {
  return useQuery({
    queryKey: qualityGateKeys.projectThresholds(projectId),
    queryFn: () =>
      api.get<QaThreshold[]>(`/projects/${projectId}/qa-thresholds`),
    enabled: projectId > 0,
  });
}

/** Fetches studio-level default thresholds. */
export function useStudioDefaults() {
  return useQuery({
    queryKey: qualityGateKeys.studioDefaults(),
    queryFn: () =>
      api.get<QaThreshold[]>("/qa/quality-gates/defaults"),
  });
}

/* --------------------------------------------------------------------------
   Threshold mutations
   -------------------------------------------------------------------------- */

/** Upsert a project-level threshold. */
export function useUpsertThreshold(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQaThreshold) =>
      api.post<QaThreshold>(
        `/projects/${projectId}/qa-thresholds`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qualityGateKeys.projectThresholds(projectId),
      });
    },
  });
}

/** Delete a project-level threshold override. */
export function useDeleteThreshold(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (thresholdId: number) =>
      api.delete(`/projects/${projectId}/qa-thresholds/${thresholdId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qualityGateKeys.projectThresholds(projectId),
      });
    },
  });
}
