/**
 * Template & preset TanStack Query hooks (PRD-27).
 *
 * Provides hooks for fetching, creating, updating, and deleting
 * templates and presets, marketplace browsing, rating, and
 * override-diff preview/apply.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreatePreset,
  CreatePresetRating,
  CreateTemplate,
  MarketplaceSortBy,
  OverrideDiff,
  Preset,
  PresetRating,
  PresetWithRating,
  Template,
  UpdatePreset,
  UpdateTemplate,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const templateKeys = {
  all: ["templates"] as const,
  list: (projectId?: number) =>
    [...templateKeys.all, "list", { projectId }] as const,
  detail: (id: number) => [...templateKeys.all, "detail", id] as const,
};

export const presetKeys = {
  all: ["presets"] as const,
  list: (projectId?: number) =>
    [...presetKeys.all, "list", { projectId }] as const,
  detail: (id: number) => [...presetKeys.all, "detail", id] as const,
  marketplace: (sortBy: string, page: number) =>
    [...presetKeys.all, "marketplace", { sortBy, page }] as const,
  ratings: (presetId: number) =>
    [...presetKeys.all, "ratings", presetId] as const,
  diff: (presetId: number, sceneTypeId: number) =>
    [...presetKeys.all, "diff", presetId, sceneTypeId] as const,
};

/* --------------------------------------------------------------------------
   Template Queries
   -------------------------------------------------------------------------- */

/** Fetch templates visible to the current user. */
export function useTemplates(projectId?: number) {
  const params = projectId ? `?project_id=${projectId}` : "";
  return useQuery({
    queryKey: templateKeys.list(projectId),
    queryFn: () => api.get<Template[]>(`/templates${params}`),
  });
}

/** Fetch a single template by ID. */
export function useTemplate(id: number) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => api.get<Template>(`/templates/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Template Mutations
   -------------------------------------------------------------------------- */

/** Create a new template. */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTemplate) =>
      api.post<Template>("/templates", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

/** Update an existing template. */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTemplate & { id: number }) =>
      api.put<Template>(`/templates/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.id),
      });
    },
  });
}

/** Delete a template. */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Preset Queries
   -------------------------------------------------------------------------- */

/** Fetch presets visible to the current user. */
export function usePresets(projectId?: number) {
  const params = projectId ? `?project_id=${projectId}` : "";
  return useQuery({
    queryKey: presetKeys.list(projectId),
    queryFn: () => api.get<Preset[]>(`/presets${params}`),
  });
}

/** Fetch a single preset by ID. */
export function usePreset(id: number) {
  return useQuery({
    queryKey: presetKeys.detail(id),
    queryFn: () => api.get<Preset>(`/presets/${id}`),
    enabled: id > 0,
  });
}

/** Fetch marketplace presets with ratings. */
export function useMarketplace(sortBy: MarketplaceSortBy = "popular", page = 1) {
  return useQuery({
    queryKey: presetKeys.marketplace(sortBy, page),
    queryFn: () =>
      api.get<PresetWithRating[]>(
        `/presets/marketplace?sort_by=${sortBy}&page=${page}`,
      ),
  });
}

/** Fetch ratings for a preset. */
export function usePresetRatings(presetId: number) {
  return useQuery({
    queryKey: presetKeys.ratings(presetId),
    queryFn: () =>
      api.get<PresetRating[]>(`/presets/${presetId}/ratings`),
    enabled: presetId > 0,
  });
}

/** Preview override diff for applying a preset to a scene type. */
export function usePreviewApply(presetId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: presetKeys.diff(presetId, sceneTypeId),
    queryFn: () =>
      api.get<OverrideDiff[]>(`/presets/${presetId}/diff/${sceneTypeId}`),
    enabled: presetId > 0 && sceneTypeId > 0,
  });
}

/* --------------------------------------------------------------------------
   Preset Mutations
   -------------------------------------------------------------------------- */

/** Create a new preset. */
export function useCreatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePreset) =>
      api.post<Preset>("/presets", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: presetKeys.all });
    },
  });
}

/** Update an existing preset. */
export function useUpdatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePreset & { id: number }) =>
      api.put<Preset>(`/presets/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: presetKeys.all });
      queryClient.invalidateQueries({
        queryKey: presetKeys.detail(variables.id),
      });
    },
  });
}

/** Delete a preset. */
export function useDeletePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: presetKeys.all });
    },
  });
}

/** Rate a preset (upsert). */
export function useRatePreset(presetId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePresetRating) =>
      api.post<PresetRating>(`/presets/${presetId}/rate`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: presetKeys.ratings(presetId),
      });
      // Also invalidate marketplace since ratings affect it.
      queryClient.invalidateQueries({
        queryKey: [...presetKeys.all, "marketplace"],
      });
    },
  });
}

/** Apply a preset to a scene type. */
export function useApplyPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      presetId,
      sceneTypeId,
    }: {
      presetId: number;
      sceneTypeId: number;
    }) =>
      api.post<Record<string, unknown>>(
        `/presets/${presetId}/apply/${sceneTypeId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: presetKeys.all });
    },
  });
}
