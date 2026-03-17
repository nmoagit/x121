/**
 * TanStack Query hooks for the recursive video generation loop (PRD-24).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toastStore } from "@/components/composite/useToast";
import { api } from "@/lib/api";
import type {
  BatchGenerateRequest,
  BatchGenerateResponse,
  GenerationLogEntry,
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
  log: (sceneId: number) => [...generationKeys.all, "log", sceneId] as const,
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

/** Fetch generation log entries for a scene. Polls every 2s while generating. */
export function useGenerationLog(sceneId: number, isGenerating = false) {
  return useQuery({
    queryKey: generationKeys.log(sceneId),
    queryFn: () =>
      api.get<GenerationLogEntry[]>(
        `/scenes/${sceneId}/generation-log?limit=200`,
      ),
    enabled: sceneId > 0,
    refetchInterval: isGenerating ? 2000 : false,
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.all,
      });
      // Also refresh scenes so status changes are reflected in the UI.
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      queryClient.invalidateQueries({ queryKey: ["characters"] });

      const count = result.started.length;
      const errors = result.errors;
      if (count > 0) {
        toastStore.addToast({
          message: `Generation started for ${count} scene${count === 1 ? "" : "s"}${errors.length > 0 ? ` (${errors.length} failed)` : ""}`,
          variant: errors.length > 0 ? "warning" : "success",
        });
      } else if (errors.length > 0) {
        // All scenes failed — show the first error message
        const firstError = errors[0]?.error ?? "Unknown error";
        toastStore.addToast({
          message: `Generation failed: ${firstError}`,
          variant: "error",
          duration: 8000,
        });
      }
    },
  });
}

/** Clear the generation log for a scene. */
export function useClearGenerationLog(sceneId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete(`/scenes/${sceneId}/generation-log`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.log(sceneId),
      });
    },
  });
}

/** Cancel an in-progress generation for a scene. Reverts to Pending. */
export function useCancelGeneration(sceneId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<{ scene_id: number; status: string; cancelled_jobs: number }>(
        `/scenes/${sceneId}/cancel-generation`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: generationKeys.all,
      });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toastStore.addToast({
        message: "Generation cancelled",
        variant: "info",
      });
    },
  });
}

/** Schedule generation for multiple scenes at a future time (PRD-134). */
export function useScheduleGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { scene_ids: number[]; scheduled_at: string }) =>
      api.post<{ schedule_id: number; scenes_scheduled: number }>(
        "/scenes/schedule-generation",
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: generationKeys.all });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      queryClient.invalidateQueries({ queryKey: ["characters"] });
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
