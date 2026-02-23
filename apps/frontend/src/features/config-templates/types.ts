/**
 * Project Configuration Templates types (PRD-74).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A project configuration template from the server. */
export interface ProjectConfig {
  id: number;
  name: string;
  description: string | null;
  version: number;
  config_json: Record<string, unknown>;
  source_project_id: number | null;
  is_recommended: boolean;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a new project config. */
export interface CreateProjectConfig {
  name: string;
  description?: string | null;
  config_json: Record<string, unknown>;
  source_project_id?: number | null;
}

/** Request body for updating an existing project config. */
export interface UpdateProjectConfig {
  name?: string;
  description?: string | null;
  config_json?: Record<string, unknown>;
  is_recommended?: boolean;
}

/** Request body for importing a config template into a project. */
export interface ImportConfigRequest {
  config_id: number;
  project_id: number;
  selected_scene_types?: string[];
}

/* --------------------------------------------------------------------------
   Response types
   -------------------------------------------------------------------------- */

/** Result summary after importing a config template. */
export interface ImportResult {
  imported_count: number;
  skipped_count: number;
  details: string[];
}

/** Diff status for a scene type comparison. */
export type DiffStatus = "added" | "changed" | "unchanged";

/** A single entry in a config diff report. */
export interface ConfigDiffEntry {
  scene_type_name: string;
  status: DiffStatus;
  current_value: Record<string, unknown> | null;
  incoming_value: Record<string, unknown> | null;
}
