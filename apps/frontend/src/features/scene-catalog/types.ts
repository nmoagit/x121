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
  source: "scene_type" | "project" | "character";
  track_id?: number;
  track_name?: string;
  track_slug?: string;
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
   Cross-join utility: settings × catalog tracks → expanded rows
   -------------------------------------------------------------------------- */

/**
 * Expands scene settings by cross-joining with catalog track data.
 *
 * For each setting, finds the matching catalog entry and creates one
 * ExpandedSceneSetting per active track. Scene types with no tracks
 * produce a single row (no track info).
 */
export function expandSettingsWithTracks(
  settings: EffectiveSceneSetting[],
  catalog: SceneCatalogEntry[],
): ExpandedSceneSetting[] {
  const catalogBySceneTypeId = new Map<number, SceneCatalogEntry>();
  for (const entry of catalog) {
    catalogBySceneTypeId.set(entry.id, entry);
  }

  const rows: ExpandedSceneSetting[] = [];

  for (const setting of settings) {
    const entry = catalogBySceneTypeId.get(setting.scene_type_id);
    const activeTracks = entry?.tracks.filter((t) => t.is_active) ?? [];

    if (activeTracks.length === 0) {
      // No tracks — single row without track info
      rows.push({
        ...setting,
        isFirstInGroup: true,
        groupSize: 1,
      });
    } else {
      // One row per active track
      for (let i = 0; i < activeTracks.length; i++) {
        const track = activeTracks[i]!;
        rows.push({
          ...setting,
          track_id: track.id,
          track_name: track.name,
          track_slug: track.slug,
          isFirstInGroup: i === 0,
          groupSize: activeTracks.length,
        });
      }
    }
  }

  return rows;
}
