/**
 * Prompt library TanStack Query hooks (PRD-63).
 *
 * Provides hooks for browsing, creating, updating, deleting,
 * and rating prompt library entries.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateLibraryEntryRequest,
  PromptLibraryEntry,
  UpdateLibraryEntryRequest,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const promptLibraryKeys = {
  all: ["prompt-library"] as const,
  list: (search?: string) =>
    ["prompt-library", "list", { search }] as const,
  detail: (id: number) => ["prompt-library", "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** List prompt library entries with optional search. */
export function usePromptLibrary(search?: string) {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  const qs = params.toString();

  return useQuery({
    queryKey: promptLibraryKeys.list(search),
    queryFn: () =>
      api.get<PromptLibraryEntry[]>(
        `/prompt-library${qs ? `?${qs}` : ""}`,
      ),
  });
}

/** Fetch a single prompt library entry by ID. */
export function useLibraryEntry(id: number) {
  return useQuery({
    queryKey: promptLibraryKeys.detail(id),
    queryFn: () => api.get<PromptLibraryEntry>(`/prompt-library/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new prompt library entry. */
export function useCreateLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLibraryEntryRequest) =>
      api.post<PromptLibraryEntry>("/prompt-library", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: promptLibraryKeys.all,
      });
    },
  });
}

/** Update an existing prompt library entry. */
export function useUpdateLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: UpdateLibraryEntryRequest & { id: number }) =>
      api.put<PromptLibraryEntry>(`/prompt-library/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: promptLibraryKeys.all,
      });
    },
  });
}

/** Delete a prompt library entry. */
export function useDeleteLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/prompt-library/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: promptLibraryKeys.all,
      });
    },
  });
}

/** Rate a prompt library entry. */
export function useRateLibraryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      api.post<PromptLibraryEntry>(`/prompt-library/${id}/rate`, {
        rating,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: promptLibraryKeys.all,
      });
    },
  });
}
