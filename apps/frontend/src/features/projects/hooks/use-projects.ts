/**
 * TanStack Query hooks for project management (PRD-112).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateProject,
  Project,
  ProjectStats,
  UpdateProject,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const projectKeys = {
  all: ["projects"] as const,
  lists: (pipelineId?: number) => [...projectKeys.all, "list", { pipelineId }] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
  stats: (id: number) => [...projectKeys.all, "stats", id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch projects, optionally filtered by pipeline. */
export function useProjects(pipelineId?: number) {
  const params = pipelineId ? `?pipeline_id=${pipelineId}` : "";
  return useQuery({
    queryKey: projectKeys.lists(pipelineId),
    queryFn: () => api.get<Project[]>(`/projects${params}`),
  });
}

/** Fetch a single project by ID. */
export function useProject(id: number) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: id > 0,
  });
}

/** Fetch stats for a single project. */
export function useProjectStats(id: number) {
  return useQuery({
    queryKey: projectKeys.stats(id),
    queryFn: () => api.get<ProjectStats>(`/projects/${id}/stats`),
    enabled: id > 0,
    refetchInterval: 15_000,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new project. */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProject) =>
      api.post<Project>("/projects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/** Update an existing project. */
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProject }) =>
      api.put<Project>(`/projects/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.id),
      });
      // Settings changes (blocking_deliverables, format profile, etc.) affect
      // stats, deliverables, and avatar readiness indicators.
      queryClient.invalidateQueries({ queryKey: projectKeys.stats(variables.id) });
      queryClient.invalidateQueries({
        queryKey: ["projects", "detail", variables.id, "deliverables"],
      });
      queryClient.invalidateQueries({ queryKey: ["avatar-dashboard"] });
    },
  });
}

/** Soft-delete a project. */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
