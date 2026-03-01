/**
 * Hook to list scenes for a character.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Scene } from "../types";

export const sceneKeys = {
  all: ["scenes"] as const,
  byCharacter: (characterId: number) =>
    [...sceneKeys.all, "character", characterId] as const,
};

export function useCharacterScenes(characterId: number) {
  return useQuery({
    queryKey: sceneKeys.byCharacter(characterId),
    queryFn: () =>
      api.get<Scene[]>(`/characters/${characterId}/scenes`),
    enabled: characterId > 0,
  });
}
