/**
 * Pure utility functions for working with ImageVariant arrays.
 */

import type { ImageVariant } from "./types";
import { IMAGE_VARIANT_STATUS } from "./types";

/**
 * Convert a relative storage path (e.g. `storage/variants/foo.png`) to
 * a URL the browser can fetch, respecting the app's base path.
 */
export function variantImageUrl(filePath: string): string {
  if (filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("/")) {
    return filePath;
  }
  return `${import.meta.env.BASE_URL}${filePath}`;
}

/**
 * Pick the best avatar URL from a set of image variants.
 *
 * Priority: hero variant with file_path > approved variant with file_path.
 * Returns null when no suitable variant is found.
 */
export function pickAvatarUrl(
  variants: Pick<ImageVariant, "is_hero" | "status_id" | "file_path">[],
): string | null {
  if (variants.length === 0) return null;
  const hero = variants.find((v) => v.is_hero && v.file_path);
  if (hero) return variantImageUrl(hero.file_path);
  const approved = variants.find(
    (v) => v.status_id === IMAGE_VARIANT_STATUS.APPROVED && v.file_path,
  );
  return approved ? variantImageUrl(approved.file_path) : null;
}

/** Find the hero variant matching a track slug (case-insensitive). */
export function findHeroVariant(
  variants: ImageVariant[],
  trackSlug: string,
): ImageVariant | undefined {
  return variants.find(
    (v) =>
      v.variant_type?.toLowerCase() === trackSlug.toLowerCase() && v.is_hero,
  );
}

/** Find any variant matching a track slug (case-insensitive), preferring hero. */
export function findVariantForTrack(
  variants: ImageVariant[],
  trackSlug: string,
): ImageVariant | undefined {
  return (
    findHeroVariant(variants, trackSlug) ??
    variants.find(
      (v) => v.variant_type?.toLowerCase() === trackSlug.toLowerCase(),
    )
  );
}
