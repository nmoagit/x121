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
  scene_catalog_id: number;
  name: string;
  slug: string;
  is_enabled: boolean;
  source: "catalog" | "project" | "character";
}

export interface SceneSettingUpdate {
  scene_catalog_id: number;
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
