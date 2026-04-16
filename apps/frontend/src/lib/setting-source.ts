/**
 * Shared catalogue setting source constants and URL builder.
 *
 * Used by both scene-catalogue (PRD-111) and image-catalogue (PRD-154)
 * for consistent source-tier display and API URL construction.
 */

/* --------------------------------------------------------------------------
   Source tier type
   -------------------------------------------------------------------------- */

/** The four inheritance tiers for catalogue settings. */
export type CatalogueSettingSource = "scene_type" | "image_type" | "project" | "group" | "avatar";

/* --------------------------------------------------------------------------
   Source color / label maps
   -------------------------------------------------------------------------- */

/**
 * Tailwind color class for each source tier.
 *
 * Both `scene_type` and `image_type` map to the same "default" styling
 * since they represent the catalogue-level default in their respective domains.
 */
export const CATALOGUE_SOURCE_COLORS: Record<string, string> = {
  scene_type: "text-[var(--color-text-muted)]",
  image_type: "text-[var(--color-text-muted)]",
  project: "text-[var(--color-data-cyan)]",
  group: "text-[var(--color-data-green)]",
  avatar: "text-[var(--color-data-orange)]",
};

/**
 * Human-readable label for each source tier.
 *
 * Both `scene_type` and `image_type` display as "default".
 */
export const CATALOGUE_SOURCE_LABELS: Record<string, string> = {
  scene_type: "default",
  image_type: "default",
  project: "project",
  group: "group",
  avatar: "model",
};

/**
 * Combined config (label + color) for each source tier.
 *
 * Used by SourceBadge and similar components that need both at once.
 */
export const CATALOGUE_SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  scene_type: { label: "Default", color: CATALOGUE_SOURCE_COLORS.scene_type! },
  image_type: { label: "Default", color: CATALOGUE_SOURCE_COLORS.image_type! },
  project: { label: "Project", color: CATALOGUE_SOURCE_COLORS.project! },
  group: { label: "Group", color: CATALOGUE_SOURCE_COLORS.group! },
  avatar: { label: "Model", color: CATALOGUE_SOURCE_COLORS.avatar! },
};

/* --------------------------------------------------------------------------
   URL builder
   -------------------------------------------------------------------------- */

/**
 * Builds the API URL for a single catalogue setting toggle or delete.
 *
 * Works for both scene settings and image settings — the only difference
 * is the `basePath` callers pass in.
 *
 * @param basePath - e.g. `/projects/5/scene-settings` or `/avatars/12/image-settings`
 * @param typeId   - the scene_type or image_type ID to target
 * @param trackId  - optional track qualifier (null targets the type level)
 */
export function catalogueSettingUrl(
  basePath: string,
  typeId: number,
  trackId: number | null | undefined,
): string {
  const base = `${basePath}/${typeId}`;
  return trackId != null ? `${base}/tracks/${trackId}` : base;
}
