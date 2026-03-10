/**
 * TanStack Query mutation hooks for infrastructure control operations (PRD-131).
 *
 * Covers orphan scanning/cleanup, bulk instance operations,
 * and per-instance actions (restart ComfyUI, force reconnect, reset state).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toastStore } from "@/components/composite/useToast";
import { api } from "@/lib/api";
import type {
  BulkRequest,
  BulkResult,
  CleanupSummary,
  OrphanCleanupRequest,
  OrphanScanResult,
} from "../types";
import { infraKeys } from "./use-all-instances";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BASE = "/admin/infrastructure";

/* --------------------------------------------------------------------------
   Orphan scanning & cleanup
   -------------------------------------------------------------------------- */

/** Scan all providers for orphaned cloud instances, DB records, and ComfyUI registrations. */
export function useOrphanScan() {
  return useMutation({
    mutationFn: () => api.post<OrphanScanResult>(`${BASE}/scan-orphans`),
    onSuccess: (result) => {
      const total =
        result.cloud_orphans.length +
        result.db_orphans.length +
        result.comfyui_orphans.length;
      toastStore.addToast({
        message:
          total > 0
            ? `Found ${total} orphan(s): ${result.cloud_orphans.length} cloud, ${result.db_orphans.length} DB, ${result.comfyui_orphans.length} ComfyUI`
            : "No orphans found",
        variant: total > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Orphan scan failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Clean up orphaned resources based on user-selected actions. */
export function useOrphanCleanup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: OrphanCleanupRequest) =>
      api.post<CleanupSummary>(`${BASE}/cleanup-orphans`, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      const actions = [
        result.cloud_imported > 0 && `${result.cloud_imported} imported`,
        result.cloud_terminated > 0 && `${result.cloud_terminated} terminated`,
        result.db_removed > 0 && `${result.db_removed} DB records removed`,
        result.db_resynced > 0 && `${result.db_resynced} resynced`,
        result.comfyui_disabled > 0 &&
          `${result.comfyui_disabled} ComfyUI disabled`,
      ].filter(Boolean);

      toastStore.addToast({
        message:
          actions.length > 0
            ? `Cleanup complete: ${actions.join(", ")}`
            : "No changes made",
        variant: result.errors.length > 0 ? "warning" : "success",
      });

      if (result.errors.length > 0) {
        toastStore.addToast({
          message: `${result.errors.length} error(s) during cleanup`,
          variant: "error",
          duration: 8000,
        });
      }
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Cleanup failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Bulk operations
   -------------------------------------------------------------------------- */

/** Start multiple cloud instances in bulk. */
export function useBulkStart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BulkRequest) =>
      api.post<BulkResult>(`${BASE}/bulk/start`, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.length - succeeded;
      toastStore.addToast({
        message:
          failed > 0
            ? `Started ${succeeded} instance(s), ${failed} failed`
            : `Started ${succeeded} instance(s)`,
        variant: failed > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Bulk start failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Stop multiple cloud instances in bulk. */
export function useBulkStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BulkRequest) =>
      api.post<BulkResult>(`${BASE}/bulk/stop`, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.length - succeeded;
      toastStore.addToast({
        message:
          failed > 0
            ? `Stopped ${succeeded} instance(s), ${failed} failed`
            : `Stopped ${succeeded} instance(s)`,
        variant: failed > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Bulk stop failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Terminate multiple cloud instances in bulk. */
export function useBulkTerminate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BulkRequest) =>
      api.post<BulkResult>(`${BASE}/bulk/terminate`, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.length - succeeded;
      toastStore.addToast({
        message:
          failed > 0
            ? `Terminated ${succeeded} instance(s), ${failed} failed`
            : `Terminated ${succeeded} instance(s)`,
        variant: failed > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Bulk terminate failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Per-instance operations
   -------------------------------------------------------------------------- */

/** Restart ComfyUI process on a specific cloud instance. */
export function useRestartComfyui() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<void>(`${BASE}/cloud-instances/${instanceId}/restart-comfyui`),
    onSuccess: (_data, instanceId) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: `ComfyUI restart initiated for instance ${instanceId}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `ComfyUI restart failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Force reconnect a cloud instance's ComfyUI websocket. */
export function useForceReconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<void>(
        `${BASE}/cloud-instances/${instanceId}/force-reconnect`,
      ),
    onSuccess: (_data, instanceId) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: `Force reconnect initiated for instance ${instanceId}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Force reconnect failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/** Reset a cloud instance's state back to initial. */
export function useResetState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<void>(`${BASE}/cloud-instances/${instanceId}/reset-state`),
    onSuccess: (_data, instanceId) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: `State reset for instance ${instanceId}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `State reset failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}
