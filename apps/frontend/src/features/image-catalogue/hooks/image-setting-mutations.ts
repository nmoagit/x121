/**
 * Image-setting toggle and remove mutation factories (PRD-154).
 *
 * Thin wrappers around the shared catalogue-setting mutation factories,
 * typed for image-specific settings.
 */

import {
  useToggleCatalogueSetting,
  useRemoveCatalogueOverride,
} from "@/lib/catalogue-setting-mutations";

import type { EffectiveImageSetting, ImageSettingUpdate } from "../types";

const TYPE_ID_FIELD = "image_type_id";

/**
 * Toggle mutation for image settings at any inheritance level.
 *
 * Optimistically flips `is_enabled` and optionally updates `source`.
 */
export function useToggleImageSetting(
  basePath: string,
  invalidationKey: readonly unknown[],
  sourceName?: EffectiveImageSetting["source"],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  return useToggleCatalogueSetting<EffectiveImageSetting, ImageSettingUpdate>(
    basePath,
    invalidationKey,
    TYPE_ID_FIELD,
    sourceName,
    extraInvalidationKeys,
  );
}

/**
 * Remove-override mutation for image settings at any inheritance level.
 *
 * Deletes the override and refetches from server for the fallback value.
 */
export function useRemoveImageOverride(
  basePath: string,
  invalidationKey: readonly unknown[],
  extraInvalidationKeys?: readonly (readonly unknown[])[],
) {
  return useRemoveCatalogueOverride<EffectiveImageSetting>(
    basePath,
    invalidationKey,
    extraInvalidationKeys,
  );
}
