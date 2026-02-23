/**
 * Prompt version TanStack Query hooks (PRD-63).
 *
 * Provides hooks for saving, listing, diffing, and restoring
 * prompt versions for scene types.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { CreatePromptVersionRequest, PromptDiff, PromptVersion } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const promptVersionKeys = {
  all: ["prompt-versions"] as const,
  forSceneType: (sceneTypeId: number) =>
    ["prompt-versions", "scene-type", sceneTypeId] as const,
  diff: (idA: number, idB: number) =>
    ["prompt-versions", "diff", idA, idB] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List prompt versions for a scene type with pagination. */
export function usePromptVersions(sceneTypeId: number) {
  return useQuery({
    queryKey: promptVersionKeys.forSceneType(sceneTypeId),
    queryFn: () =>
      api.get<PromptVersion[]>(
        `/scene-types/${sceneTypeId}/prompt-versions`,
      ),
    enabled: sceneTypeId > 0,
  });
}

/** Compute a diff between two prompt versions. */
export function useDiffVersions(idA: number, idB: number) {
  return useQuery({
    queryKey: promptVersionKeys.diff(idA, idB),
    queryFn: () =>
      api.get<PromptDiff>(`/prompt-versions/${idA}/diff/${idB}`),
    enabled: idA > 0 && idB > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Save a new prompt version. */
export function useSavePromptVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePromptVersionRequest) =>
      api.post<PromptVersion>(
        `/scene-types/${input.scene_type_id}/prompt-versions`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: promptVersionKeys.forSceneType(variables.scene_type_id),
      });
    },
  });
}

/** Restore a previous prompt version (creates a new version with old content). */
export function useRestoreVersion(sceneTypeId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<PromptVersion>(`/prompt-versions/${versionId}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: promptVersionKeys.forSceneType(sceneTypeId),
      });
    },
  });
}
