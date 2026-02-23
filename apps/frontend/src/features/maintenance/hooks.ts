/**
 * Bulk Data Maintenance TanStack Query hooks (PRD-18).
 *
 * Provides hooks for previewing/executing find-replace and re-path
 * operations, undoing operations, and browsing operation history.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ExecutionResponse,
  FindReplaceRequest,
  OperationListParams,
  PreviewResponse,
  RepathRequest,
} from "./types";

import {
  executeFindReplace,
  executeRepath,
  getOperation,
  listOperations,
  previewFindReplace,
  previewRepath,
  undoOperation,
} from "./api";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const maintenanceKeys = {
  all: ["maintenance"] as const,
  operations: (params?: OperationListParams) =>
    ["maintenance", "operations", params] as const,
  operation: (id: number) => ["maintenance", "operation", id] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List bulk operations with optional filters. */
export function useOperations(params?: OperationListParams) {
  return useQuery({
    queryKey: maintenanceKeys.operations(params),
    queryFn: () => listOperations(params),
  });
}

/** Fetch a single bulk operation by ID. */
export function useOperation(id: number) {
  return useQuery({
    queryKey: maintenanceKeys.operation(id),
    queryFn: () => getOperation(id),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Preview a find/replace operation. */
export function usePreviewFindReplace() {
  return useMutation<PreviewResponse, Error, FindReplaceRequest>({
    mutationFn: (body) => previewFindReplace(body),
  });
}

/** Execute a previously previewed find/replace operation. */
export function useExecuteFindReplace() {
  const queryClient = useQueryClient();

  return useMutation<ExecutionResponse, Error, number>({
    mutationFn: (id) => executeFindReplace(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operation(id),
      });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operations(),
      });
    },
  });
}

/** Preview a re-path operation. */
export function usePreviewRepath() {
  return useMutation<PreviewResponse, Error, RepathRequest>({
    mutationFn: (body) => previewRepath(body),
  });
}

/** Execute a previously previewed re-path operation. */
export function useExecuteRepath() {
  const queryClient = useQueryClient();

  return useMutation<ExecutionResponse, Error, number>({
    mutationFn: (id) => executeRepath(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operation(id),
      });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operations(),
      });
    },
  });
}

/** Undo a completed bulk operation. */
export function useUndoOperation() {
  const queryClient = useQueryClient();

  return useMutation<ExecutionResponse, Error, number>({
    mutationFn: (id) => undoOperation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operation(id),
      });
      queryClient.invalidateQueries({
        queryKey: maintenanceKeys.operations(),
      });
    },
  });
}
