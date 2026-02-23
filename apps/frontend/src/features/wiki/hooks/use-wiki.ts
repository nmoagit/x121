/**
 * TanStack Query hooks for the Studio Wiki & Contextual Help feature (PRD-56).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ContextualHelpResponse,
  CreateWikiArticle,
  DiffResponse,
  UpdateWikiArticle,
  WikiArticle,
  WikiVersion,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const wikiKeys = {
  all: ["wiki"] as const,
  articles: (category?: string, isPinned?: boolean) =>
    [...wikiKeys.all, "articles", { category, isPinned }] as const,
  article: (slug: string) => [...wikiKeys.all, "article", slug] as const,
  versions: (slug: string) =>
    [...wikiKeys.all, "versions", slug] as const,
  version: (slug: string, version: number) =>
    [...wikiKeys.all, "version", slug, version] as const,
  diff: (slug: string, v1: number, v2: number) =>
    [...wikiKeys.all, "diff", slug, v1, v2] as const,
  search: (query: string) => [...wikiKeys.all, "search", query] as const,
  help: (elementId: string) =>
    [...wikiKeys.all, "help", elementId] as const,
  pinned: () => [...wikiKeys.all, "pinned"] as const,
};

/* --------------------------------------------------------------------------
   Article queries
   -------------------------------------------------------------------------- */

/** List wiki articles with optional category and pinned filtering. */
export function useWikiArticles(category?: string, isPinned?: boolean) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (isPinned !== undefined) params.set("is_pinned", String(isPinned));
  const qs = params.toString();
  const path = qs ? `/wiki/articles?${qs}` : "/wiki/articles";

  return useQuery({
    queryKey: wikiKeys.articles(category, isPinned),
    queryFn: () => api.get<WikiArticle[]>(path),
  });
}

/** Fetch a single wiki article by slug. */
export function useWikiArticle(slug: string) {
  return useQuery({
    queryKey: wikiKeys.article(slug),
    queryFn: () => api.get<WikiArticle>(`/wiki/articles/${slug}`),
    enabled: slug.length > 0,
  });
}

/** Search wiki articles by query string. */
export function useSearchArticles(query: string) {
  return useQuery({
    queryKey: wikiKeys.search(query),
    queryFn: () =>
      api.get<WikiArticle[]>(
        `/wiki/articles/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.trim().length > 0,
  });
}

/** List all pinned wiki articles. */
export function usePinnedArticles() {
  return useQuery({
    queryKey: wikiKeys.pinned(),
    queryFn: () => api.get<WikiArticle[]>("/wiki/articles/pinned"),
  });
}

/** Fetch contextual help for a UI element. */
export function useContextualHelp(elementId: string) {
  return useQuery({
    queryKey: wikiKeys.help(elementId),
    queryFn: () =>
      api.get<ContextualHelpResponse>(
        `/wiki/articles/help/${encodeURIComponent(elementId)}`,
      ),
    enabled: elementId.length > 0,
  });
}

/* --------------------------------------------------------------------------
   Version queries
   -------------------------------------------------------------------------- */

/** List all versions of a wiki article. */
export function useWikiVersions(slug: string) {
  return useQuery({
    queryKey: wikiKeys.versions(slug),
    queryFn: () =>
      api.get<WikiVersion[]>(`/wiki/articles/${slug}/versions`),
    enabled: slug.length > 0,
  });
}

/** Fetch a specific version of a wiki article. */
export function useWikiVersion(slug: string, version: number) {
  return useQuery({
    queryKey: wikiKeys.version(slug, version),
    queryFn: () =>
      api.get<WikiVersion>(
        `/wiki/articles/${slug}/versions/${version}`,
      ),
    enabled: slug.length > 0 && version > 0,
  });
}

/** Compute a diff between two versions of an article. */
export function useDiffVersions(slug: string, v1: number, v2: number) {
  return useQuery({
    queryKey: wikiKeys.diff(slug, v1, v2),
    queryFn: () =>
      api.get<DiffResponse>(
        `/wiki/articles/${slug}/diff?v1=${v1}&v2=${v2}`,
      ),
    enabled: slug.length > 0 && v1 > 0 && v2 > 0 && v1 !== v2,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new wiki article. */
export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWikiArticle) =>
      api.post<WikiArticle>("/wiki/articles", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}

/** Update an existing wiki article. */
export function useUpdateArticle(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWikiArticle) =>
      api.put<WikiArticle>(`/wiki/articles/${slug}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}

/** Delete a wiki article. */
export function useDeleteArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) =>
      api.delete(`/wiki/articles/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}

/** Revert an article to a previous version. */
export function useRevertVersion(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (version: number) =>
      api.post<WikiArticle>(
        `/wiki/articles/${slug}/revert/${version}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}
