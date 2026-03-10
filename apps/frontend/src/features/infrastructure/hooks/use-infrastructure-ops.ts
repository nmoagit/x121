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
   Shared bulk mutation factory (DRY-730)
   -------------------------------------------------------------------------- */

/**
 * Creates a bulk mutation hook for a given endpoint and verb label.
 * All bulk operations share the same request/response shape and
 * success/error toast pattern.
 */
function useBulkMutation(endpoint: string, verb: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BulkRequest) =>
      api.post<BulkResult>(`${BASE}/bulk/${endpoint}`, request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.length - succeeded;
      toastStore.addToast({
        message:
          failed > 0
            ? `${verb} ${succeeded} instance(s), ${failed} failed`
            : `${verb} ${succeeded} instance(s)`,
        variant: failed > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `Bulk ${endpoint} failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Shared per-instance mutation factory
   -------------------------------------------------------------------------- */

function useInstanceMutation(pathSuffix: string, successLabel: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanceId: number) =>
      api.post<void>(`${BASE}/cloud-instances/${instanceId}/${pathSuffix}`),
    onSuccess: (_data, instanceId) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.all });
      toastStore.addToast({
        message: `${successLabel} for instance ${instanceId}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toastStore.addToast({
        message: `${successLabel} failed: ${error.message}`,
        variant: "error",
        duration: 8000,
      });
    },
  });
}

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
   Bulk operations (DRY-730: all share useBulkMutation)
   -------------------------------------------------------------------------- */

/** Start multiple cloud instances in bulk. */
export function useBulkStart() {
  return useBulkMutation("start", "Started");
}

/** Stop multiple cloud instances in bulk. */
export function useBulkStop() {
  return useBulkMutation("stop", "Stopped");
}

/** Terminate multiple cloud instances in bulk. */
export function useBulkTerminate() {
  return useBulkMutation("terminate", "Terminated");
}

/* --------------------------------------------------------------------------
   Per-instance operations (shared factory)
   -------------------------------------------------------------------------- */

/** Restart ComfyUI process on a specific cloud instance. */
export function useRestartComfyui() {
  return useInstanceMutation("restart-comfyui", "ComfyUI restart initiated");
}

/** Force reconnect a cloud instance's ComfyUI websocket. */
export function useForceReconnect() {
  return useInstanceMutation("force-reconnect", "Force reconnect initiated");
}

/** Reset a cloud instance's state back to initial. */
export function useResetState() {
  return useInstanceMutation("reset-state", "State reset");
}
