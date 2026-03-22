/**
 * Hook that resolves hero thumbnail URLs for a list of avatars.
 *
 * Uses `useQueries` to batch-fetch image variants per avatar, then picks
 * the hero (or first approved) variant as the thumbnail. Returns a Map from
 * avatar ID to thumbnail URL string.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { imageVariantKeys } from "@/features/images/hooks/use-image-variants";
import type { ImageVariant } from "@/features/images/types";
import { pickAvatarThumbnailUrl } from "@/features/images/utils";

export function useAvatarThumbnails(avatarIds: number[]): Map<number, string> {
  const results = useQueries({
    queries: avatarIds.map((id) => ({
      queryKey: imageVariantKeys.list(id),
      queryFn: () => api.get<ImageVariant[]>(`/avatars/${id}/image-variants`),
      enabled: id > 0,
      staleTime: 5 * 60 * 1000, // avatars change rarely — cache 5 min
    })),
  });

  return useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < avatarIds.length; i++) {
      const variants = results[i]?.data;
      if (variants) {
        const url = pickAvatarThumbnailUrl(variants, 256);
        if (url) map.set(avatarIds[i]!, url);
      }
    }
    return map;
  }, [avatarIds, results]);
}
