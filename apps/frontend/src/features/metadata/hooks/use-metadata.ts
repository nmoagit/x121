/**
 * TanStack Query hooks for the dual-metadata system (PRD-13).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AvatarMetadata,
  RegenerateProjectRequest,
  RegenerationReport,
  StaleMetadataReport,
  VideoMetadata,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const metadataKeys = {
  all: ["metadata"] as const,
  avatarPreview: (avatarId: number) =>
    [...metadataKeys.all, "avatar-preview", avatarId] as const,
  videoPreview: (sceneId: number) =>
    [...metadataKeys.all, "video-preview", sceneId] as const,
  stale: (projectId: number) =>
    [...metadataKeys.all, "stale", projectId] as const,
};

/* --------------------------------------------------------------------------
   Preview hooks
   -------------------------------------------------------------------------- */

/** Fetch avatar metadata preview (read-only, no DB write). */
export function useAvatarMetadataPreview(avatarId: number) {
  return useQuery({
    queryKey: metadataKeys.avatarPreview(avatarId),
    queryFn: () =>
      api.get<AvatarMetadata>(
        `/avatars/${avatarId}/metadata/preview`,
      ),
    enabled: avatarId > 0,
  });
}

/** Fetch video metadata preview for a scene (read-only, no DB write). */
export function useVideoMetadataPreview(sceneId: number) {
  return useQuery({
    queryKey: metadataKeys.videoPreview(sceneId),
    queryFn: () =>
      api.get<VideoMetadata>(`/scenes/${sceneId}/metadata/preview`),
    enabled: sceneId > 0,
  });
}

/* --------------------------------------------------------------------------
   Staleness hooks
   -------------------------------------------------------------------------- */

/** Fetch stale metadata report for a project. */
export function useStaleMetadata(projectId: number) {
  return useQuery({
    queryKey: metadataKeys.stale(projectId),
    queryFn: () =>
      api.get<StaleMetadataReport>(
        `/projects/${projectId}/metadata/stale`,
      ),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Regeneration mutations
   -------------------------------------------------------------------------- */

/** Regenerate metadata for a single avatar. */
export function useRegenerateAvatarMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (avatarId: number) =>
      api.post<{ status: string; avatar_id: number }>(
        `/avatars/${avatarId}/metadata/regenerate`,
      ),
    onSuccess: (_data, avatarId) => {
      queryClient.invalidateQueries({
        queryKey: metadataKeys.avatarPreview(avatarId),
      });
      // Also invalidate staleness since it may have changed.
      queryClient.invalidateQueries({
        queryKey: metadataKeys.all,
        predicate: (query) =>
          query.queryKey[0] === "metadata" && query.queryKey[1] === "stale",
      });
    },
  });
}

/** Regenerate metadata for all avatars in a project. */
export function useRegenerateProjectMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      options,
    }: {
      projectId: number;
      options?: RegenerateProjectRequest;
    }) =>
      api.post<RegenerationReport>(
        `/projects/${projectId}/metadata/regenerate`,
        options ?? {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metadataKeys.all });
    },
  });
}
