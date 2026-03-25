/**
 * TanStack Query hooks for annotation text presets (PRD-149).
 *
 * Presets are pipeline-scoped quick-fill labels for annotation notes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface AnnotationPreset {
  id: number;
  pipeline_id: number | null;
  label: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CreatePresetInput {
  pipeline_id?: number;
  label: string;
  color?: string;
}

interface UpdatePresetInput {
  label?: string;
  color?: string | null;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const presetKeys = {
  all: ["annotation-presets"] as const,
  list: (pipelineId?: number) =>
    [...presetKeys.all, "list", pipelineId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch annotation presets, optionally scoped to a pipeline. */
export function useAnnotationPresets(pipelineId?: number) {
  const params = pipelineId ? `?pipeline_id=${pipelineId}` : "";
  return useQuery({
    queryKey: presetKeys.list(pipelineId),
    queryFn: () =>
      api.get<AnnotationPreset[]>(`/annotation-presets${params}`),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new annotation preset. */
export function useCreateAnnotationPreset(pipelineId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePresetInput) =>
      api.post<AnnotationPreset>("/annotation-presets", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: presetKeys.list(pipelineId),
      });
    },
  });
}

/** Update an existing annotation preset. */
export function useUpdateAnnotationPreset(pipelineId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePresetInput & { id: number }) =>
      api.put<AnnotationPreset>(`/annotation-presets/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: presetKeys.list(pipelineId),
      });
    },
  });
}

/** Delete an annotation preset. */
export function useDeleteAnnotationPreset(pipelineId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/annotation-presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: presetKeys.list(pipelineId),
      });
    },
  });
}
