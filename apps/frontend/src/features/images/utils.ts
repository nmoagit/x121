/**
 * Pure utility functions for working with ImageVariant arrays.
 */

import type { ImageVariant } from "./types";
import { IMAGE_VARIANT_STATUS, PREFERRED_VARIANT_TYPE } from "./types";

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
 * Priority: clothed hero > any hero > clothed approved > any approved.
 * Returns null when no suitable variant is found.
 */
export function pickAvatarUrl(
  variants: Pick<ImageVariant, "is_hero" | "status_id" | "file_path" | "variant_type">[],
): string | null {
  if (variants.length === 0) return null;

  const heroes = variants.filter((v) => v.is_hero && v.file_path);
  const clothedHero = heroes.find((v) => v.variant_type?.toLowerCase() === PREFERRED_VARIANT_TYPE);
  if (clothedHero) return variantImageUrl(clothedHero.file_path);
  if (heroes.length > 0) return variantImageUrl(heroes[0]!.file_path);

  const approved = variants.filter(
    (v) => v.status_id === IMAGE_VARIANT_STATUS.APPROVED && v.file_path,
  );
  const clothedApproved = approved.find((v) => v.variant_type?.toLowerCase() === PREFERRED_VARIANT_TYPE);
  if (clothedApproved) return variantImageUrl(clothedApproved.file_path);
  return approved.length > 0 ? variantImageUrl(approved[0]!.file_path) : null;
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
