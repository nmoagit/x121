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
  lists: () => [...projectKeys.all, "list"] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
  stats: (id: number) => [...projectKeys.all, "stats", id] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all projects. */
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: () => api.get<Project[]>("/projects"),
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
