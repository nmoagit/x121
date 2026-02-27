/**
 * TanStack Query hooks for character sub-resources (PRD-112).
 *
 * Covers settings and metadata endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CharacterMetadata, CharacterSettings } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const characterDetailKeys = {
  settings: (projectId: number, characterId: number) =>
    ["projects", projectId, "characters", characterId, "settings"] as const,
  metadata: (characterId: number) =>
    ["characters", characterId, "metadata"] as const,
};

/* --------------------------------------------------------------------------
   Settings hooks
   -------------------------------------------------------------------------- */

/** Fetch character settings. */
export function useCharacterSettings(projectId: number, characterId: number) {
  return useQuery({
    queryKey: characterDetailKeys.settings(projectId, characterId),
    queryFn: () =>
      api.get<CharacterSettings>(
        `/projects/${projectId}/characters/${characterId}/settings`,
      ),
    enabled: projectId > 0 && characterId > 0,
  });
}

/** Update character settings (partial merge). */
export function useUpdateCharacterSettings(
  projectId: number,
  characterId: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CharacterSettings) =>
      api.patch<CharacterSettings>(
        `/projects/${projectId}/characters/${characterId}/settings`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterDetailKeys.settings(projectId, characterId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch character metadata. */
export function useCharacterMetadata(characterId: number) {
  return useQuery({
    queryKey: characterDetailKeys.metadata(characterId),
    queryFn: () =>
      api.get<CharacterMetadata>(`/characters/${characterId}/metadata`),
    enabled: characterId > 0,
  });
}

/** Replace character metadata. */
export function useUpdateCharacterMetadata(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CharacterMetadata) =>
      api.put<CharacterMetadata>(
        `/characters/${characterId}/metadata`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterDetailKeys.metadata(characterId),
      });
    },
  });
}
