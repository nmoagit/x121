/**
 * Hook that fetches existing image variant types for duplicate avatars.
 *
 * Used by ImportConfirmModal to show diff badges (new vs existing) when
 * uploading assets to avatars that already exist in the project.
 */

import { useEffect, useState } from "react";

import { fetchVariantTypeSet } from "@/features/images/hooks/use-image-variants";

/**
 * Fetches existing variant types for a set of duplicate avatar IDs.
 *
 * Only runs when `open` is true and `duplicateAvatarIds` is non-empty.
 * Failed fetches produce empty Sets so everything looks "new" (graceful fallback).
 */
export function useDuplicateAssetInfo(
  open: boolean,
  duplicateAvatarIds: number[],
): {
  variantMap: Map<number, Set<string>>;
  loading: boolean;
} {
  const [variantMap, setVariantMap] = useState<Map<number, Set<string>>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || duplicateAvatarIds.length === 0) {
      setVariantMap(new Map());
      return;
    }

    let cancelled = false;

    async function fetchVariants() {
      setLoading(true);
      const map = new Map<number, Set<string>>();

      await Promise.all(
        duplicateAvatarIds.map(async (charId) => {
          try {
            map.set(charId, await fetchVariantTypeSet(charId));
          } catch {
            map.set(charId, new Set());
          }
        }),
      );

      if (!cancelled) {
        setVariantMap(map);
        setLoading(false);
      }
    }

    fetchVariants();
    return () => {
      cancelled = true;
    };
  }, [open, duplicateAvatarIds.join(",")]);

  return { variantMap, loading };
}
