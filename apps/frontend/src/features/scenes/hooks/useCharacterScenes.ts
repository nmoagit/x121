/**
 * Hooks for character scene listing and creation.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Scene } from "../types";

export const sceneKeys = {
  all: ["scenes"] as const,
  byCharacter: (characterId: number) =>
    [...sceneKeys.all, "character", characterId] as const,
};

/**
 * Fetch scenes for a character.
 *
 * When `hasGenerating` is true the query polls every 3 seconds so that
 * status transitions (e.g. generating → generated) are picked up promptly
 * without waiting for the default staleTime.
 */
export function useCharacterScenes(characterId: number, hasGenerating = false) {
  return useQuery({
    queryKey: sceneKeys.byCharacter(characterId),
    queryFn: () =>
      api.get<Scene[]>(`/characters/${characterId}/scenes`),
    enabled: characterId > 0,
    refetchInterval: hasGenerating ? 3000 : false,
  });
}

/* --------------------------------------------------------------------------
   Create scene
   -------------------------------------------------------------------------- */

export interface CreateSceneInput {
  scene_type_id: number;
  image_variant_id?: number | null;
  track_id?: number | null;
  transition_mode?: string;
}

/** Create a new scene for a character. */
export function useCreateScene(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSceneInput) =>
      api.post<Scene>(`/characters/${characterId}/scenes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sceneKeys.byCharacter(characterId),
      });
    },
  });
}
