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
import { mediaVariantKeys } from "@/features/media/hooks/use-media-variants";
import type { MediaVariant } from "@/features/media/types";
import { pickAvatarThumbnailUrl } from "@/features/media/utils";

export function useAvatarThumbnails(avatarIds: number[]): Map<number, string> {
  const results = useQueries({
    queries: avatarIds.map((id) => ({
      queryKey: mediaVariantKeys.list(id),
      queryFn: () => api.get<MediaVariant[]>(`/avatars/${id}/media-variants`),
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
