/**
 * TanStack Query hooks for the dual-metadata system (PRD-13).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterMetadata,
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
  characterPreview: (characterId: number) =>
    [...metadataKeys.all, "character-preview", characterId] as const,
  videoPreview: (sceneId: number) =>
    [...metadataKeys.all, "video-preview", sceneId] as const,
  stale: (projectId: number) =>
    [...metadataKeys.all, "stale", projectId] as const,
};

/* --------------------------------------------------------------------------
   Preview hooks
   -------------------------------------------------------------------------- */

/** Fetch character metadata preview (read-only, no DB write). */
export function useCharacterMetadataPreview(characterId: number) {
  return useQuery({
    queryKey: metadataKeys.characterPreview(characterId),
    queryFn: () =>
      api.get<CharacterMetadata>(
        `/characters/${characterId}/metadata/preview`,
      ),
    enabled: characterId > 0,
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

/** Regenerate metadata for a single character. */
export function useRegenerateCharacterMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (characterId: number) =>
      api.post<{ status: string; character_id: number }>(
        `/characters/${characterId}/metadata/regenerate`,
      ),
    onSuccess: (_data, characterId) => {
      queryClient.invalidateQueries({
        queryKey: metadataKeys.characterPreview(characterId),
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

/** Regenerate metadata for all characters in a project. */
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
