/**
 * TanStack Query hooks for Custom QA Rulesets per Scene Type (PRD-91).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AbTestRequest,
  AbTestResult,
  CreateQaProfile,
  MetricThreshold,
  QaProfile,
  SceneTypeQaOverride,
  UpdateQaProfile,
  UpsertSceneTypeQaOverride,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const qaProfileKeys = {
  all: ["qa-profiles"] as const,
  detail: (id: number) => [...qaProfileKeys.all, id] as const,
};

export const qaOverrideKeys = {
  all: ["qa-overrides"] as const,
  bySceneType: (sceneTypeId: number) =>
    [...qaOverrideKeys.all, sceneTypeId] as const,
  effective: (sceneTypeId: number) =>
    [...qaOverrideKeys.all, "effective", sceneTypeId] as const,
};

/* --------------------------------------------------------------------------
   Profile queries
   -------------------------------------------------------------------------- */

/** Fetches all QA profiles. */
export function useQaProfiles() {
  return useQuery({
    queryKey: qaProfileKeys.all,
    queryFn: () => api.get<QaProfile[]>("/qa-profiles"),
  });
}

/** Fetches a single QA profile by id. */
export function useQaProfile(id: number) {
  return useQuery({
    queryKey: qaProfileKeys.detail(id),
    queryFn: () => api.get<QaProfile>(`/qa-profiles/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Override queries
   -------------------------------------------------------------------------- */

/** Fetches the QA override for a scene type. */
export function useSceneTypeQaOverride(sceneTypeId: number) {
  return useQuery({
    queryKey: qaOverrideKeys.bySceneType(sceneTypeId),
    queryFn: () =>
      api.get<SceneTypeQaOverride>(
        `/scene-types/${sceneTypeId}/qa-override`,
      ),
    enabled: sceneTypeId > 0,
  });
}

/** Fetches the effective (resolved) thresholds for a scene type. */
export function useEffectiveThresholds(sceneTypeId: number) {
  return useQuery({
    queryKey: qaOverrideKeys.effective(sceneTypeId),
    queryFn: () =>
      api.get<Record<string, MetricThreshold>>(
        `/scene-types/${sceneTypeId}/effective-thresholds`,
      ),
    enabled: sceneTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Profile mutations
   -------------------------------------------------------------------------- */

/** Creates a new QA profile. */
export function useCreateQaProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQaProfile) =>
      api.post<QaProfile>("/qa-profiles", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qaProfileKeys.all });
    },
  });
}

/** Updates an existing QA profile. */
export function useUpdateQaProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateQaProfile }) =>
      api.put<QaProfile>(`/qa-profiles/${id}`, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: qaProfileKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: qaProfileKeys.all });
    },
  });
}

/** Deletes a QA profile. */
export function useDeleteQaProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/qa-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qaProfileKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Override mutations
   -------------------------------------------------------------------------- */

/** Upserts a scene-type QA override. */
export function useUpsertSceneTypeQaOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sceneTypeId,
      data,
    }: {
      sceneTypeId: number;
      data: UpsertSceneTypeQaOverride;
    }) =>
      api.put<SceneTypeQaOverride>(
        `/scene-types/${sceneTypeId}/qa-override`,
        data,
      ),
    onSuccess: (_data, { sceneTypeId }) => {
      queryClient.invalidateQueries({
        queryKey: qaOverrideKeys.bySceneType(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: qaOverrideKeys.effective(sceneTypeId),
      });
    },
  });
}

/** Deletes a scene-type QA override (resets to defaults). */
export function useDeleteSceneTypeQaOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sceneTypeId: number) =>
      api.delete(`/scene-types/${sceneTypeId}/qa-override`),
    onSuccess: (_data, sceneTypeId) => {
      queryClient.invalidateQueries({
        queryKey: qaOverrideKeys.bySceneType(sceneTypeId),
      });
      queryClient.invalidateQueries({
        queryKey: qaOverrideKeys.effective(sceneTypeId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   A/B test mutation
   -------------------------------------------------------------------------- */

/** Runs an A/B threshold test against historical data. */
export function useAbTestThresholds() {
  return useMutation({
    mutationFn: (input: AbTestRequest) =>
      api.post<AbTestResult>("/qa-profiles/ab-test", input),
  });
}
