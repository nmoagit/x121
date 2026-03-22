/**
 * Shared helpers for the avatar dashboard feature (PRD-108).
 */

import type { MissingItem, MissingItemCategory } from "./types";

/**
 * Convert raw missing-item strings from the readiness API into
 * structured MissingItem objects with category and action URL.
 */
export function deriveMissingItems(
  avatarId: number,
  missingItems: string[],
): MissingItem[] {
  return missingItems.map((item) => {
    let category: MissingItemCategory = "pipeline_setting";
    if (item === "source_image") category = "source_image";
    else if (item === "approved_variant") category = "approved_variant";
    else if (item === "metadata_complete") category = "metadata_complete";

    const urlMap: Record<MissingItemCategory, string> = {
      source_image: `/avatars/${avatarId}/source-images`,
      approved_variant: `/avatars/${avatarId}/image-variants`,
      metadata_complete: `/avatars/${avatarId}/metadata`,
      pipeline_setting: `/avatars/${avatarId}/settings`,
    };

    return {
      category,
      label: item.replace(/_/g, " "),
      actionUrl: urlMap[category],
    };
  });
}
