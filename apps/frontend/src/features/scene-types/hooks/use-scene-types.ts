/**
 * TanStack Query hooks for scene type configuration (PRD-23).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateSceneType,
  MatrixCell,
  PromptPreviewResponse,
  SceneType,
  UpdateSceneType,
  ValidationResult,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const sceneTypeKeys = {
  all: ["scene-types"] as const,
  lists: () => [...sceneTypeKeys.all, "list"] as const,
  list: (projectId?: number) =>
    [...sceneTypeKeys.lists(), { projectId }] as const,
  details: () => [...sceneTypeKeys.all, "detail"] as const,
  detail: (id: number) => [...sceneTypeKeys.details(), id] as const,
  preview: (sceneTypeId: number, characterId: number, clipPosition?: string) =>
    [
      ...sceneTypeKeys.all,
      "preview",
      sceneTypeId,
      characterId,
      clipPosition,
    ] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch studio-level scene types, or project-scoped if projectId is given. */
export function useSceneTypes(projectId?: number) {
  return useQuery({
    queryKey: sceneTypeKeys.list(projectId),
    queryFn: () => {
      const path = projectId
        ? `/projects/${projectId}/scene-types`
        : "/scene-types";
      return api.get<SceneType[]>(path);
    },
  });
}

/** Fetch a single scene type by id. */
export function useSceneType(id: number | null) {
  return useQuery({
    queryKey: sceneTypeKeys.detail(id ?? 0),
    queryFn: () => api.get<SceneType>(`/scene-types/${id}`),
    enabled: id !== null,
  });
}

/** Preview a resolved prompt for a given scene type and character. */
export function usePreviewPrompt(
  sceneTypeId: number | null,
  characterId: number | null,
  clipPosition?: string,
) {
  return useQuery({
    queryKey: sceneTypeKeys.preview(
      sceneTypeId ?? 0,
      characterId ?? 0,
      clipPosition,
    ),
    queryFn: () => {
      const params = clipPosition ? `?clip_position=${clipPosition}` : "";
      return api.get<PromptPreviewResponse>(
        `/scene-types/${sceneTypeId}/preview-prompt/${characterId}${params}`,
      );
    },
    enabled: sceneTypeId !== null && characterId !== null,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new scene type. */
export function useCreateSceneType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneType) =>
      api.post<SceneType>("/scene-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneTypeKeys.all });
    },
  });
}

/** Update an existing scene type. */
export function useUpdateSceneType(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSceneType) =>
      api.put<SceneType>(`/scene-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneTypeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: sceneTypeKeys.lists() });
    },
  });
}

/** Soft-delete a scene type. */
export function useDeleteSceneType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/scene-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneTypeKeys.all });
    },
  });
}

/** Generate the scene matrix for given characters and scene types. */
export function useGenerateMatrix() {
  return useMutation({
    mutationFn: (data: { character_ids: number[]; scene_type_ids: number[] }) =>
      api.post<MatrixCell[]>("/scene-types/matrix", data),
  });
}

/** Validate a scene type configuration without persisting. */
export function useValidateSceneType() {
  return useMutation({
    mutationFn: (data: CreateSceneType) =>
      api.post<ValidationResult>("/scene-types/validate", data),
  });
}
