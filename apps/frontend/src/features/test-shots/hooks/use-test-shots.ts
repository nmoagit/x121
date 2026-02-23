/**
 * Test shot TanStack Query hooks (PRD-58).
 *
 * Provides hooks for generating, listing, promoting, and deleting
 * test shots used for scene previews.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  BatchTestShotRequest,
  BatchTestShotResponse,
  GenerateTestShotRequest,
  PromoteResponse,
  TestShot,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const testShotKeys = {
  all: ["test-shots"] as const,
  gallery: (sceneTypeId: number, characterId?: number) =>
    ["test-shots", "gallery", { sceneTypeId, characterId }] as const,
  detail: (id: number) => ["test-shots", "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List test shots as a filterable gallery for a scene type. */
export function useTestShotGallery(
  sceneTypeId: number,
  characterId?: number,
) {
  const params = new URLSearchParams({
    scene_type_id: String(sceneTypeId),
  });
  if (characterId != null) {
    params.set("character_id", String(characterId));
  }

  return useQuery({
    queryKey: testShotKeys.gallery(sceneTypeId, characterId),
    queryFn: () =>
      api.get<TestShot[]>(`/test-shots?${params.toString()}`),
    enabled: sceneTypeId > 0,
  });
}

/** Fetch a single test shot by ID. */
export function useTestShot(id: number) {
  return useQuery({
    queryKey: testShotKeys.detail(id),
    queryFn: () => api.get<TestShot>(`/test-shots/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Generate a single test shot. */
export function useGenerateTestShot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateTestShotRequest) =>
      api.post<TestShot>("/test-shots", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: testShotKeys.gallery(variables.scene_type_id),
      });
    },
  });
}

/** Generate a batch of test shots for multiple characters. */
export function useBatchTestShots() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BatchTestShotRequest) =>
      api.post<BatchTestShotResponse>("/test-shots/batch", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: testShotKeys.gallery(variables.scene_type_id),
      });
    },
  });
}

/** Promote a test shot to a full scene. */
export function usePromoteTestShot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<PromoteResponse>(`/test-shots/${id}/promote`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testShotKeys.all,
      });
    },
  });
}

/** Delete a test shot. */
export function useDeleteTestShot(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/test-shots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testShotKeys.gallery(sceneTypeId),
      });
    },
  });
}
