/**
 * Hook that resolves hero avatar URLs for a list of characters.
 *
 * Uses `useQueries` to batch-fetch image variants per character, then picks
 * the hero (or first approved) variant as the avatar. Returns a Map from
 * character ID to avatar URL string.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { imageVariantKeys } from "@/features/images/hooks/use-image-variants";
import type { ImageVariant } from "@/features/images/types";
import { pickAvatarUrl } from "@/features/images/utils";

export function useCharacterAvatars(characterIds: number[]): Map<number, string> {
  const results = useQueries({
    queries: characterIds.map((id) => ({
      queryKey: imageVariantKeys.list(id),
      queryFn: () => api.get<ImageVariant[]>(`/characters/${id}/image-variants`),
      enabled: id > 0,
      staleTime: 5 * 60 * 1000, // avatars change rarely — cache 5 min
    })),
  });

  return useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < characterIds.length; i++) {
      const variants = results[i]?.data;
      if (variants) {
        const url = pickAvatarUrl(variants);
        if (url) map.set(characterIds[i]!, url);
      }
    }
    return map;
  }, [characterIds, results]);
}
