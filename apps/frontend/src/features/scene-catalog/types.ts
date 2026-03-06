/**
 * Scene catalog & track management types (PRD-111).
 */

export interface Track {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SceneCatalogEntry {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  has_clothes_off_transition: boolean;
  sort_order: number;
  is_active: boolean;
  tracks: Track[];
  created_at: string;
  updated_at: string;
}

export interface CreateSceneCatalogEntry {
  name: string;
  slug: string;
  description?: string | null;
  has_clothes_off_transition?: boolean;
  sort_order?: number;
  is_active?: boolean;
  track_ids: number[];
}

export interface UpdateSceneCatalogEntry {
  name?: string;
  description?: string | null;
  has_clothes_off_transition?: boolean;
  sort_order?: number;
  is_active?: boolean;
  track_ids?: number[];
}

export interface EffectiveSceneSetting {
  scene_type_id: number;
  name: string;
  slug: string;
  is_enabled: boolean;
  source: "scene_type" | "project" | "group" | "character";
  track_id: number | null;
  track_name: string | null;
  track_slug: string | null;
  has_clothes_off_transition: boolean;
}

/**
 * An EffectiveSceneSetting expanded with track info from the catalog cross-join.
 * Each enabled scene_type generates one row per associated track.
 */
export interface ExpandedSceneSetting extends EffectiveSceneSetting {
  /** True when this is the first track row for a scene_type group (for visual grouping). */
  isFirstInGroup: boolean;
  /** Total track count for this scene_type group. */
  groupSize: number;
}

export interface SceneSettingUpdate {
  scene_type_id: number;
  track_id?: number | null;
  is_enabled: boolean;
}

export interface CreateTrack {
  name: string;
  slug: string;
  sort_order?: number;
}

export interface UpdateTrack {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

/* --------------------------------------------------------------------------
   URL helper: build scene-setting toggle/delete URL with optional track
   -------------------------------------------------------------------------- */

/**
 * Builds the API URL for a single scene setting toggle or delete.
 *
 * @param basePath - e.g. `/projects/5/scene-settings` or `/characters/12/scene-settings`
 * @param sceneTypeId - the scene type to target
 * @param trackId - optional track qualifier (null targets the scene_type level)
 */
export function sceneSettingUrl(
  basePath: string,
  sceneTypeId: number,
  trackId: number | null | undefined,
): string {
  const base = `${basePath}/${sceneTypeId}`;
  return trackId != null ? `${base}/tracks/${trackId}` : base;
}

/* --------------------------------------------------------------------------
   Grouping utility: annotate backend-expanded rows with visual group info
   -------------------------------------------------------------------------- */

/**
 * Annotates backend-returned per-(scene_type, track) rows with visual
 * grouping metadata (`isFirstInGroup`, `groupSize`).
 *
 * The backend now returns track-expanded data directly, so no cross-join
 * is needed — this only adds the UI grouping annotations.
 */
export function annotateGroups(settings: EffectiveSceneSetting[]): ExpandedSceneSetting[] {
  const rows: ExpandedSceneSetting[] = [];

  let i = 0;
  while (i < settings.length) {
    const currentId = settings[i]!.scene_type_id;
    // Count consecutive rows with same scene_type_id
    let groupSize = 0;
    for (let j = i; j < settings.length && settings[j]!.scene_type_id === currentId; j++) {
      groupSize++;
    }
    // Annotate each row in the group
    for (let k = 0; k < groupSize; k++) {
      rows.push({
        ...settings[i + k]!,
        isFirstInGroup: k === 0,
        groupSize,
      });
    }
    i += groupSize;
  }

  return rows;
}
