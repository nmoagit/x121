/**
 * Poster Frame TanStack Query hooks (PRD-96).
 *
 * Provides hooks for fetching, setting, adjusting, and auto-selecting
 * poster frames for avatars and scenes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  AutoSelectResult,
  PosterFrame,
  UpdatePosterFrameAdjustments,
  UpsertPosterFrame,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const posterFrameKeys = {
  all: ["poster-frames"] as const,
  entity: (entityType: string, entityId: number) =>
    ["poster-frames", entityType, entityId] as const,
  gallery: (projectId: number) =>
    ["poster-frames", "gallery", projectId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the poster frame for a specific entity (avatar or scene). */
export function useGetPosterFrame(entityType: string, entityId: number) {
  return useQuery({
    queryKey: posterFrameKeys.entity(entityType, entityId),
    queryFn: () =>
      api.get<PosterFrame>(`/poster-frames/${entityType}/${entityId}`),
    enabled: entityId > 0 && entityType.length > 0,
  });
}

/** Fetch all poster frames for a project (gallery view). */
export function usePosterGallery(projectId: number) {
  return useQuery({
    queryKey: posterFrameKeys.gallery(projectId),
    queryFn: () =>
      api.get<PosterFrame[]>(`/projects/${projectId}/poster-frames`),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Set (upsert) a avatar's poster frame. */
export function useSetAvatarPoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      avatarId,
      body,
    }: {
      avatarId: number;
      body: UpsertPosterFrame;
    }) =>
      api.post<PosterFrame>(
        `/poster-frames/avatar/${avatarId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.entity("avatar", variables.avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.all,
      });
    },
  });
}

/** Set (upsert) a scene's poster frame. */
export function useSetScenePoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sceneId,
      body,
    }: {
      sceneId: number;
      body: UpsertPosterFrame;
    }) =>
      api.post<PosterFrame>(`/poster-frames/scene/${sceneId}`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.entity("scene", variables.sceneId),
      });
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.all,
      });
    },
  });
}

/** Auto-select the best poster frame for all avatars in a project. */
export function useAutoSelectPosters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) =>
      api.post<AutoSelectResult[]>(
        `/projects/${projectId}/poster-frames/auto-select`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.all,
      });
    },
  });
}

/** Update crop/brightness/contrast adjustments on an existing poster frame. */
export function useUpdateAdjustments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      posterFrameId,
      body,
    }: {
      posterFrameId: number;
      body: UpdatePosterFrameAdjustments;
    }) =>
      api.patch<PosterFrame>(`/poster-frames/${posterFrameId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: posterFrameKeys.all,
      });
    },
  });
}
