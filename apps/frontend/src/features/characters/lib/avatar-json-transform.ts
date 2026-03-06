/**
 * Avatar JSON transform (placeholder).
 *
 * Merges character metadata and pipeline settings into a single
 * avatar JSON payload. Source keys (_source_bio, _source_tov) are
 * stripped from the metadata before merging.
 *
 * This is a placeholder implementation — the real transform script
 * will replace this logic later.
 */

import { SOURCE_KEYS } from "@/features/characters/types";
import type { CharacterMetadata, CharacterSettings } from "@/features/characters/types";

/**
 * Generate an avatar JSON object from character metadata and settings.
 *
 * Strips internal source keys from metadata and merges with settings.
 */
export function generateAvatarJson(
  metadata: CharacterMetadata,
  settings: CharacterSettings,
): Record<string, unknown> {
  const cleanedMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SOURCE_KEYS.has(key)) {
      cleanedMetadata[key] = value;
    }
  }

  return {
    metadata: cleanedMetadata,
    settings,
  };
}
