/**
 * Command palette TanStack Query hooks (PRD-31).
 *
 * Provides hooks for recent items CRUD and palette search.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  RecordAccessRequest,
  UserRecentItem,
} from "../types";
import { DEFAULT_RECENT_LIMIT } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const paletteKeys = {
  all: ["palette"] as const,
  recentItems: () => [...paletteKeys.all, "recent-items"] as const,
  search: (query: string) => [...paletteKeys.all, "search", query] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch recent items for the current user. */
export function useRecentItems(limit: number = DEFAULT_RECENT_LIMIT) {
  return useQuery({
    queryKey: paletteKeys.recentItems(),
    queryFn: () =>
      api.get<UserRecentItem[]>(`/user/recent-items?limit=${limit}`),
  });
}

/** Search the palette (debounced query). */
export function usePaletteSearch(query: string) {
  return useQuery({
    queryKey: paletteKeys.search(query),
    queryFn: () =>
      api.get<unknown[]>(`/search/palette?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Record an entity access. */
export function useRecordAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordAccessRequest) =>
      api.post<UserRecentItem>("/user/recent-items", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paletteKeys.recentItems() });
    },
  });
}

/** Clear all recent items. */
export function useClearRecent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete("/user/recent-items"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paletteKeys.recentItems() });
    },
  });
}
