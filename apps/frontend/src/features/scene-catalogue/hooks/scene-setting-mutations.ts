/**
 * Scene-setting toggle and remove mutation factories (PRD-111).
 *
 * Thin wrappers around the shared catalogue-setting mutation factories,
 * typed for scene-specific settings.
 */

import {
  useToggleCatalogueSetting,
  useRemoveCatalogueOverride,
} from "@/lib/catalogue-setting-mutations";

import type { EffectiveSceneSetting, SceneSettingUpdate } from "../types";

const TYPE_ID_FIELD = "scene_type_id";

/**
 * Toggle mutation for scene settings at any inheritance level.
 *
 * Optimistically flips `is_enabled` and optionally updates `source`.
 */
export function useToggleSceneSetting(
  basePath: string,
  invalidationKey: readonly unknown[],
  sourceName?: EffectiveSceneSetting["source"],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  return useToggleCatalogueSetting<EffectiveSceneSetting, SceneSettingUpdate>(
    basePath,
    invalidationKey,
    TYPE_ID_FIELD,
    sourceName,
    extraInvalidationKeys,
  );
}

/**
 * Remove-override mutation for scene settings at any inheritance level.
 *
 * Deletes the override and refetches from server for the fallback value.
 */
export function useRemoveSceneOverride(
  basePath: string,
  invalidationKey: readonly unknown[],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  return useRemoveCatalogueOverride<EffectiveSceneSetting>(
    basePath,
    invalidationKey,
    extraInvalidationKeys,
  );
}
