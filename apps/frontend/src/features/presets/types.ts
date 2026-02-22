/**
 * Template & preset feature types (PRD-27).
 */

/* --------------------------------------------------------------------------
   Template types
   -------------------------------------------------------------------------- */

/** A template record from the server. */
export interface Template {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  scope: Scope;
  project_id: number | null;
  workflow_config: Record<string, unknown>;
  parameter_slots: Record<string, unknown> | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new template. */
export interface CreateTemplate {
  name: string;
  description?: string | null;
  scope?: Scope;
  project_id?: number | null;
  workflow_config: Record<string, unknown>;
  parameter_slots?: Record<string, unknown> | null;
}

/** Update payload for an existing template (all fields optional). */
export interface UpdateTemplate {
  name?: string;
  description?: string | null;
  scope?: Scope;
  project_id?: number | null;
  workflow_config?: Record<string, unknown>;
  parameter_slots?: Record<string, unknown> | null;
}

/* --------------------------------------------------------------------------
   Preset types
   -------------------------------------------------------------------------- */

/** A preset record from the server. */
export interface Preset {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  scope: Scope;
  project_id: number | null;
  parameters: Record<string, unknown>;
  version: number;
  usage_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new preset. */
export interface CreatePreset {
  name: string;
  description?: string | null;
  scope?: Scope;
  project_id?: number | null;
  parameters: Record<string, unknown>;
}

/** Update payload for an existing preset (all fields optional). */
export interface UpdatePreset {
  name?: string;
  description?: string | null;
  scope?: Scope;
  project_id?: number | null;
  parameters?: Record<string, unknown>;
}

/** A preset enriched with aggregated rating data. */
export interface PresetWithRating extends Preset {
  avg_rating: number | null;
  rating_count: number;
}

/* --------------------------------------------------------------------------
   Rating types
   -------------------------------------------------------------------------- */

/** A preset rating record from the server. */
export interface PresetRating {
  id: number;
  preset_id: number;
  user_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

/** Create/update payload for a preset rating. */
export interface CreatePresetRating {
  rating: number;
  comment?: string | null;
}

/* --------------------------------------------------------------------------
   Override diff types
   -------------------------------------------------------------------------- */

/** A single field difference when previewing preset application. */
export interface OverrideDiff {
  field: string;
  current_value: unknown;
  preset_value: unknown;
}

/* --------------------------------------------------------------------------
   Enums / Constants
   -------------------------------------------------------------------------- */

/** Visibility scope for templates and presets. */
export type Scope = "personal" | "project" | "studio";

/** Sort options for marketplace queries. */
export type MarketplaceSortBy = "popular" | "rating" | "recent";

/** Maximum length for template/preset names. */
export const MAX_NAME_LEN = 200;

/** Maximum length for descriptions. */
export const MAX_DESCRIPTION_LEN = 5000;

/** Rating range. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;
