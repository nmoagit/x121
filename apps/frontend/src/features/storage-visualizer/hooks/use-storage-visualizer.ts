/**
 * TanStack Query hooks for the Storage Visualizer (PRD-19).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  FileTypeBreakdown,
  FileTypeCategory,
  StorageSummary,
  TreemapNode,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const keys = {
  all: ["storage-visualizer"] as const,
  treemap: (entityType?: string, entityId?: number) =>
    [...keys.all, "treemap", entityType, entityId] as const,
  breakdown: () => [...keys.all, "breakdown"] as const,
  summary: () => [...keys.all, "summary"] as const,
  categories: () => [...keys.all, "categories"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Summary / breakdown polling interval: 60 seconds. */
const POLL_MS = 60_000;

/* --------------------------------------------------------------------------
   Treemap data
   -------------------------------------------------------------------------- */

/**
 * Fetch the hierarchical treemap for a given entity scope.
 *
 * The backend returns an array of root nodes. This hook wraps them in a
 * synthetic root node so `computeTreemapLayout` can consume a single root.
 *
 * When no `entityType` is provided the root-level treemap is returned.
 * Drill-down passes `entityType` and `entityId` to fetch children.
 */
export function useTreemapData(entityType?: string, entityId?: number) {
  const params = new URLSearchParams();
  if (entityType) params.set("entity_type", entityType);
  if (entityId !== undefined) params.set("entity_id", String(entityId));
  const qs = params.toString();

  return useQuery({
    queryKey: keys.treemap(entityType, entityId),
    queryFn: async () => {
      const nodes = await api.get<TreemapNode[]>(
        `/admin/storage/treemap${qs ? `?${qs}` : ""}`,
      );

      // Wrap in a synthetic root so computeTreemapLayout receives a single node.
      const totalSize = nodes.reduce((s, n) => s + n.size, 0);
      const totalFiles = nodes.reduce((s, n) => s + n.file_count, 0);
      const totalReclaimable = nodes.reduce(
        (s, n) => s + n.reclaimable_bytes,
        0,
      );

      return {
        name: "Root",
        entity_type: "root",
        entity_id: 0,
        size: totalSize,
        file_count: totalFiles,
        reclaimable_bytes: totalReclaimable,
        children: nodes,
      } satisfies TreemapNode;
    },
  });
}

/* --------------------------------------------------------------------------
   Breakdown
   -------------------------------------------------------------------------- */

/** Fetch file-type breakdown across the entire system. */
export function useBreakdown() {
  return useQuery({
    queryKey: keys.breakdown(),
    queryFn: () =>
      api.get<FileTypeBreakdown[]>("/admin/storage/breakdown"),
    refetchInterval: POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Summary
   -------------------------------------------------------------------------- */

/** Fetch the high-level storage summary (total, reclaimable, etc.). */
export function useStorageSummary() {
  return useQuery({
    queryKey: keys.summary(),
    queryFn: () => api.get<StorageSummary>("/admin/storage/summary"),
    refetchInterval: POLL_MS,
  });
}

/* --------------------------------------------------------------------------
   Categories
   -------------------------------------------------------------------------- */

/** Fetch file-type categories (lookup data, rarely changes). */
export function useCategories() {
  return useQuery({
    queryKey: keys.categories(),
    queryFn: () =>
      api.get<FileTypeCategory[]>("/admin/storage/categories"),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/* --------------------------------------------------------------------------
   Refresh mutation
   -------------------------------------------------------------------------- */

/** Trigger a fresh storage snapshot on the backend. */
export function useRefreshSnapshots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/admin/storage/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}
