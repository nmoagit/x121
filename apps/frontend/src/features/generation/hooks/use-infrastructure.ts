/**
 * TanStack Query hooks for generation infrastructure management.
 *
 * Provides controls for RunPod pods, ComfyUI instances, and status polling.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toastStore } from "@/components/composite/useToast";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ComfyUIInstanceInfo {
  id: number;
  name: string;
  api_url: string;
  ws_url: string;
  is_enabled: boolean;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  cloud_instance_id: number | null;
}

export interface InfrastructureStatus {
  runpod_configured: boolean;
  comfyui_instances: ComfyUIInstanceInfo[];
  connected_count: number;
}

export interface PodStartResult {
  pod_id: string;
  comfyui_api_url: string;
  comfyui_ws_url: string;
  instance_registered: boolean;
  manager_refreshed: boolean;
}

export interface PodStopResult {
  pod_id: string;
  terminated: boolean;
  instances_disabled: number;
}

export interface RefreshResult {
  connected_count: number;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const infraKeys = {
  all: ["infrastructure"] as const,
  status: () => [...infraKeys.all, "status"] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Poll infrastructure status (10s when no instances, 30s when connected). */
export function useInfrastructureStatus() {
  return useQuery({
    queryKey: infraKeys.status(),
    queryFn: () =>
      api.get<InfrastructureStatus>("/admin/infrastructure/status"),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.connected_count > 0) return 30_000;
      return 10_000;
    },
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Start/resume RunPod pod and register ComfyUI instance. */
export function useStartPod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<PodStartResult>("/admin/infrastructure/pod/start"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: result.manager_refreshed
          ? `Pod ${result.pod_id} started — ComfyUI connected`
          : `Pod ${result.pod_id} started — waiting for ComfyUI connection`,
        variant: result.manager_refreshed ? "success" : "warning",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Failed to start pod: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Stop/terminate RunPod pod. */
export function useStopPod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (podId?: string | void) =>
      api.post<PodStopResult>("/admin/infrastructure/pod/stop", {
        pod_id: podId || null,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: `Pod ${result.pod_id} terminated`,
        variant: "info",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Failed to stop pod: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Refresh ComfyUI instance connections from DB. */
export function useRefreshInstances() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<RefreshResult>("/admin/infrastructure/comfyui/refresh"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message:
          result.connected_count > 0
            ? `${result.connected_count} instance(s) connected`
            : "No instances found",
        variant: result.connected_count > 0 ? "success" : "warning",
      });
    },
  });
}
