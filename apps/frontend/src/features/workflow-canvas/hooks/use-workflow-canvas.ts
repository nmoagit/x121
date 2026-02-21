/**
 * TanStack Query hooks for the workflow canvas (PRD-33).
 *
 * Provides data fetching for canvas layout, telemetry, and ComfyUI import.
 * Uses the key-factory pattern consistent with other feature hooks.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CanvasState,
  ComfyUIParseResult,
  WorkflowLayout,
  WorkflowTelemetry,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const workflowCanvasKeys = {
  all: ["workflow-canvas"] as const,
  canvas: (workflowId: number) =>
    [...workflowCanvasKeys.all, "canvas", workflowId] as const,
  telemetry: (workflowId: number) =>
    [...workflowCanvasKeys.all, "telemetry", workflowId] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch the persisted canvas layout for a workflow. */
export function useCanvas(workflowId: number) {
  return useQuery({
    queryKey: workflowCanvasKeys.canvas(workflowId),
    queryFn: () =>
      api.get<WorkflowLayout>(`/workflows/${workflowId}/canvas`),
    enabled: workflowId > 0,
  });
}

/** Save (upsert) the canvas layout for a workflow. */
export function useSaveCanvas(workflowId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (state: CanvasState) =>
      api.put<WorkflowLayout>(`/workflows/${workflowId}/canvas`, {
        canvas_json: state,
        node_positions_json: Object.fromEntries(
          state.nodes.map((n) => [n.id, n.position]),
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowCanvasKeys.canvas(workflowId),
      });
    },
  });
}

/** Fetch per-node timing telemetry for a workflow. */
export function useTelemetry(workflowId: number) {
  return useQuery({
    queryKey: workflowCanvasKeys.telemetry(workflowId),
    queryFn: () =>
      api.get<WorkflowTelemetry>(`/workflows/${workflowId}/telemetry`),
    enabled: workflowId > 0,
    refetchInterval: 5_000, // Poll every 5s during active generation.
  });
}

/** Import a ComfyUI workflow JSON and convert to canvas nodes/edges. */
export function useImportComfyUI() {
  return useMutation({
    mutationFn: (workflowJson: Record<string, unknown>) =>
      api.post<ComfyUIParseResult>("/workflows/import-comfyui", {
        workflow_json: workflowJson,
      }),
  });
}
