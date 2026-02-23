/**
 * Branch TanStack Query hooks (PRD-50).
 *
 * Provides hooks for creating, listing, comparing, promoting, and
 * deleting branches used for concurrent creative exploration of scenes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  Branch,
  BranchComparison,
  CreateBranch,
  UpdateBranch,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const branchKeys = {
  all: ["branches"] as const,
  byScene: (sceneId: number) => ["branches", "scene", sceneId] as const,
  detail: (id: number) => ["branches", "detail", id] as const,
  compare: (id: number, otherId: number) =>
    ["branches", "compare", id, otherId] as const,
  stale: (olderThanDays?: number) =>
    ["branches", "stale", { olderThanDays }] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List all branches for a scene. */
export function useBranches(sceneId: number) {
  return useQuery({
    queryKey: branchKeys.byScene(sceneId),
    queryFn: () => api.get<Branch[]>(`/scenes/${sceneId}/branches`),
    enabled: sceneId > 0,
  });
}

/** Fetch a single branch by ID. */
export function useBranch(id: number) {
  return useQuery({
    queryKey: branchKeys.detail(id),
    queryFn: () => api.get<Branch>(`/branches/${id}`),
    enabled: id > 0,
  });
}

/** Compare two branches side-by-side. */
export function useCompareBranches(id: number, otherId: number) {
  return useQuery({
    queryKey: branchKeys.compare(id, otherId),
    queryFn: () =>
      api.get<BranchComparison>(`/branches/${id}/compare/${otherId}`),
    enabled: id > 0 && otherId > 0,
  });
}

/** List stale branches (not updated in N days, not default). */
export function useStaleBranches(olderThanDays?: number) {
  const params = new URLSearchParams();
  if (olderThanDays != null) {
    params.set("older_than_days", String(olderThanDays));
  }
  const qs = params.toString();
  const path = qs ? `/branches/stale?${qs}` : "/branches/stale";

  return useQuery({
    queryKey: branchKeys.stale(olderThanDays),
    queryFn: () => api.get<Branch[]>(path),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new branch for a scene. */
export function useCreateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sceneId,
      input,
    }: {
      sceneId: number;
      input: CreateBranch;
    }) => api.post<Branch>(`/scenes/${sceneId}/branch`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: branchKeys.byScene(variables.sceneId),
      });
    },
  });
}

/** Update an existing branch. */
export function useUpdateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateBranch }) =>
      api.put<Branch>(`/branches/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}

/** Delete a branch. */
export function useDeleteBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/branches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}

/** Promote a branch to the scene's default. */
export function usePromoteBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<Branch>(`/branches/${id}/promote`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}
