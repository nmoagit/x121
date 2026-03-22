/**
 * TanStack Query hooks for pipeline management (PRD-138).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreatePipeline,
  Pipeline,
  UpdatePipeline,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const pipelineKeys = {
  all: ["pipelines"] as const,
  lists: () => [...pipelineKeys.all, "list"] as const,
  detail: (id: number) => [...pipelineKeys.all, "detail", id] as const,
  byCode: (code: string) => [...pipelineKeys.all, "code", code] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all pipelines. */
export function usePipelines() {
  return useQuery({
    queryKey: pipelineKeys.lists(),
    queryFn: () => api.get<Pipeline[]>("/pipelines"),
  });
}

/** Fetch a single pipeline by ID. */
export function usePipeline(id: number) {
  return useQuery({
    queryKey: pipelineKeys.detail(id),
    queryFn: () => api.get<Pipeline>(`/pipelines/${id}`),
    enabled: id > 0,
  });
}

/** Fetch a single pipeline by code. */
export function usePipelineByCode(code: string) {
  return useQuery({
    queryKey: pipelineKeys.byCode(code),
    queryFn: () => api.get<Pipeline>(`/pipelines/code/${code}`),
    enabled: code.length > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new pipeline. */
export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePipeline) =>
      api.post<Pipeline>("/pipelines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    },
  });
}

/** Update an existing pipeline. */
export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePipeline }) =>
      api.put<Pipeline>(`/pipelines/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.id),
      });
    },
  });
}

/** Delete a pipeline. */
export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/pipelines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    },
  });
}
