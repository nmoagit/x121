/**
 * Character Settings Dashboard types (PRD-108).
 */

/* --------------------------------------------------------------------------
   Dashboard section enum
   -------------------------------------------------------------------------- */

/** Logical sections of the character dashboard. */
export type DashboardSection =
  | "identity"
  | "images"
  | "metadata"
  | "settings"
  | "scene_assignments"
  | "generation_history";

/** Categories of missing configuration items. */
export type MissingItemCategory =
  | "source_image"
  | "approved_variant"
  | "metadata_complete"
  | "pipeline_setting";

/* --------------------------------------------------------------------------
   API response types
   -------------------------------------------------------------------------- */

/** Image variant counts grouped by status. */
export interface VariantCounts {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

/** Snapshot of the readiness cache. */
export interface ReadinessSnapshot {
  state: string;
  missing_items: string[];
  readiness_pct: number;
}

/** Summary of segment generation statuses. */
export interface GenerationSummary {
  total_segments: number;
  approved: number;
  rejected: number;
  pending: number;
}

/** Aggregated dashboard data returned by GET /characters/{id}/dashboard. */
export interface CharacterDashboardData {
  character_id: number;
  character_name: string;
  project_id: number;
  source_image_count: number;
  variant_counts: VariantCounts;
  settings: Record<string, unknown>;
  readiness: ReadinessSnapshot | null;
  scene_count: number;
  generation_summary: GenerationSummary;
}

/** A missing item with category, label, and action URL. */
export interface MissingItem {
  category: MissingItemCategory;
  label: string;
  actionUrl: string;
}

/** A scene assignment row for the dashboard table. */
export interface SceneAssignment {
  scene_id: number;
  scene_name: string;
  status: string;
  segment_count: number;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for PATCH /characters/{id}/settings. */
export type PatchSettingsPayload = Record<string, unknown>;
