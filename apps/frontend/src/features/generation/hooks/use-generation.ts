/**
 * TanStack Query hooks for the recursive video generation loop (PRD-24).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BatchGenerateRequest,
  BatchGenerateResponse,
  GenerationProgress,
  SelectBoundaryFrameRequest,
  StartGenerationRequest,
  StartGenerationResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const generationKeys = {
  all: ["generation"] as const,
  progresses: () => [...generationKeys.all, "progress"] as const,
  progress: (sceneId: number) =>
    [...generationKeys.progresses(), sceneId] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Poll generation progress for a scene (3-second interval). */
export function useGenerationProgress(sceneId: number) {
  return useQuery({
    queryKey: generationKeys.progress(sceneId),
    queryFn: () =>
      api.get<GenerationProgress>(`/scenes/${sceneId}/progress`),
    enabled: sceneId > 0,
    refetchInterval: 3000,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Start generation for a single scene. */
export function useStartGeneration(sceneId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: StartGenerationRequest) =>
      api.post<StartGenerationResponse>(
        `/scenes/${sceneId}/generate`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.progress(sceneId),
      });
    },
  });
}

/** Start generation for multiple scenes in batch. */
export function useBatchGenerate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BatchGenerateRequest) =>
      api.post<BatchGenerateResponse>("/scenes/batch-generate", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.all,
      });
    },
  });
}

/** Manually select a boundary frame for a segment. */
export function useSelectBoundaryFrame(segmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SelectBoundaryFrameRequest) =>
      api.post<{ segment_id: number; boundary_frame_index: number }>(
        `/segments/${segmentId}/select-boundary-frame`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.all,
      });
    },
  });
}
