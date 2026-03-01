/**
 * Shared helpers for the character dashboard feature (PRD-108).
 */

import type { MissingItem, MissingItemCategory } from "./types";

/**
 * Convert raw missing-item strings from the readiness API into
 * structured MissingItem objects with category and action URL.
 */
export function deriveMissingItems(
  characterId: number,
  missingItems: string[],
): MissingItem[] {
  return missingItems.map((item) => {
    let category: MissingItemCategory = "pipeline_setting";
    if (item === "source_image") category = "source_image";
    else if (item === "approved_variant") category = "approved_variant";
    else if (item === "metadata_complete") category = "metadata_complete";

    const urlMap: Record<MissingItemCategory, string> = {
      source_image: `/characters/${characterId}/source-images`,
      approved_variant: `/characters/${characterId}/image-variants`,
      metadata_complete: `/characters/${characterId}/metadata`,
      pipeline_setting: `/characters/${characterId}/settings`,
    };

    return {
      category,
      label: item.replace(/_/g, " "),
      actionUrl: urlMap[category],
    };
  });
}
