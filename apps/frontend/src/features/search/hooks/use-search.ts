/**
 * TanStack Query hooks for search & discovery (PRD-20).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateSavedSearch,
  SavedSearch,
  SearchParams,
  SearchResponse,
  SimilarityRequest,
  SimilarityResult,
  TypeaheadResult,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const searchKeys = {
  all: ["search"] as const,
  results: (params: SearchParams) =>
    [...searchKeys.all, "results", params] as const,
  typeahead: (q: string) => [...searchKeys.all, "typeahead", q] as const,
  saved: () => [...searchKeys.all, "saved"] as const,
  savedExec: (id: number) =>
    [...searchKeys.all, "saved", "execute", id] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build query string from SearchParams (skipping undefined values). */
function buildSearchQuery(params: SearchParams): string {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.entity_types) searchParams.set("entity_types", params.entity_types);
  if (params.project_id !== undefined)
    searchParams.set("project_id", String(params.project_id));
  if (params.status) searchParams.set("status", params.status);
  if (params.tags) searchParams.set("tags", params.tags);
  if (params.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined)
    searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

/* --------------------------------------------------------------------------
   Search hooks
   -------------------------------------------------------------------------- */

/** Execute a unified search with full-text, facets, and timing. */
export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: searchKeys.results(params),
    queryFn: () =>
      api.get<SearchResponse>(`/search${buildSearchQuery(params)}`),
    enabled: !!params.q && params.q.length >= 2,
  });
}

/** Fetch typeahead suggestions for search-as-you-type. */
export function useTypeahead(query: string) {
  return useQuery({
    queryKey: searchKeys.typeahead(query),
    queryFn: () =>
      api.get<TypeaheadResult[]>(
        `/search/typeahead?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.length >= 2,
    staleTime: 30_000, // Cache for 30 seconds to reduce API calls.
  });
}

/** Execute a visual similarity search. */
export function useSimilaritySearch() {
  return useMutation({
    mutationFn: (request: SimilarityRequest) =>
      api.post<SimilarityResult[]>("/search/similar", request),
  });
}

/* --------------------------------------------------------------------------
   Saved search hooks
   -------------------------------------------------------------------------- */

/** List all saved searches (user's own + shared). */
export function useSavedSearches() {
  return useQuery({
    queryKey: searchKeys.saved(),
    queryFn: () => api.get<SavedSearch[]>("/search/saved"),
  });
}

/** Create a new saved search. */
export function useCreateSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSavedSearch) =>
      api.post<SavedSearch>("/search/saved", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.saved() });
    },
  });
}

/** Delete a saved search. */
export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/search/saved/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.saved() });
    },
  });
}

/** Execute a saved search by ID. */
export function useExecuteSavedSearch(id: number | null) {
  return useQuery({
    queryKey: searchKeys.savedExec(id ?? 0),
    queryFn: () =>
      api.get<SearchResponse>(`/search/saved/${id}/execute`),
    enabled: id !== null,
  });
}
