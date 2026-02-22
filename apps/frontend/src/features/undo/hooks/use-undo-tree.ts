/**
 * TanStack Query hooks for undo tree server persistence (PRD-51).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { SaveUndoTreeInput, UndoTreeEntity } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const undoTreeKeys = {
  all: ["undo-tree"] as const,
  tree: (entityType: string, entityId: number) =>
    [...undoTreeKeys.all, entityType, entityId] as const,
  userTrees: ["undo-trees"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch an undo tree for a specific entity from the server. */
export function useUndoTree(entityType: string, entityId: number) {
  return useQuery({
    queryKey: undoTreeKeys.tree(entityType, entityId),
    queryFn: () =>
      api.get<UndoTreeEntity | null>(
        `/user/undo-tree/${entityType}/${entityId}`,
      ),
    enabled: entityId > 0 && entityType.length > 0,
  });
}

/** Save (upsert) an undo tree for a specific entity. */
export function useSaveUndoTree(entityType: string, entityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveUndoTreeInput) =>
      api.put<UndoTreeEntity>(
        `/user/undo-tree/${entityType}/${entityId}`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: undoTreeKeys.tree(entityType, entityId),
      });
    },
  });
}

/** Delete an undo tree for a specific entity. */
export function useDeleteUndoTree(entityType: string, entityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/user/undo-tree/${entityType}/${entityId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: undoTreeKeys.tree(entityType, entityId),
      });
      void queryClient.invalidateQueries({
        queryKey: undoTreeKeys.userTrees,
      });
    },
  });
}

/** List all undo trees for the current user. */
export function useUserUndoTrees() {
  return useQuery({
    queryKey: undoTreeKeys.userTrees,
    queryFn: () => api.get<UndoTreeEntity[]>("/user/undo-trees"),
  });
}
