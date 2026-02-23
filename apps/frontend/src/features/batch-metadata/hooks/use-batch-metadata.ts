/**
 * Batch Metadata Operations TanStack Query hooks (PRD-88).
 *
 * Provides hooks for creating previews, executing operations,
 * undoing operations, and listing operation history.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPreview,
  executeOperation,
  fetchOperation,
  fetchOperations,
  undoOperation,
} from "../api";
import type {
  CreateBatchMetadataRequest,
  ListBatchMetadataParams,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const batchMetadataKeys = {
  all: ["batchMetadata"] as const,
  list: (params?: ListBatchMetadataParams) =>
    ["batchMetadata", "list", params] as const,
  detail: (id: number) => ["batchMetadata", "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch a list of batch metadata operations. */
export function useBatchMetadataOperations(params?: ListBatchMetadataParams) {
  return useQuery({
    queryKey: batchMetadataKeys.list(params),
    queryFn: () => fetchOperations(params),
  });
}

/** Fetch a single batch metadata operation by ID. */
export function useBatchMetadataOperation(id: number) {
  return useQuery({
    queryKey: batchMetadataKeys.detail(id),
    queryFn: () => fetchOperation(id),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a preview batch metadata operation. */
export function useCreatePreview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBatchMetadataRequest) => createPreview(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: batchMetadataKeys.all });
    },
  });
}

/** Execute a previewed operation. */
export function useExecuteOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => executeOperation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: batchMetadataKeys.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: batchMetadataKeys.all });
    },
  });
}

/** Undo a completed operation. */
export function useUndoOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => undoOperation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: batchMetadataKeys.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: batchMetadataKeys.all });
    },
  });
}
