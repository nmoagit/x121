/**
 * TypeScript types for project hub & management (PRD-112).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Project
   -------------------------------------------------------------------------- */

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProject {
  name: string;
  description?: string;
}

export interface UpdateProject {
  name?: string;
  description?: string;
  status?: string;
}

/* --------------------------------------------------------------------------
   Project stats
   -------------------------------------------------------------------------- */

export interface ProjectStats {
  character_count: number;
  characters_ready: number;
  characters_generating: number;
  characters_complete: number;
  scenes_enabled: number;
  scenes_generated: number;
  scenes_approved: number;
  scenes_rejected: number;
  scenes_pending: number;
  delivery_readiness_pct: number;
}

/* --------------------------------------------------------------------------
   Character groups
   -------------------------------------------------------------------------- */

export interface CharacterGroup {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCharacterGroup {
  name: string;
  sort_order?: number;
}

export interface UpdateCharacterGroup {
  name?: string;
  sort_order?: number;
}

/* --------------------------------------------------------------------------
   Characters (project-scoped)
   -------------------------------------------------------------------------- */

export interface Character {
  id: number;
  project_id: number;
  name: string;
  status_id: number | null;
  metadata: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  group_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCharacter {
  name: string;
  status_id?: number;
  group_id?: number;
}

export interface UpdateCharacter {
  name?: string;
  status_id?: number;
  group_id?: number | null;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Status ID to human-readable label mapping. */
export const STATUS_LABELS: Record<number, string> = {
  1: "Draft",
  2: "Setup",
  3: "Ready",
  4: "Generating",
  5: "Complete",
};

/** Status ID to badge color mapping. */
export const STATUS_COLORS: Record<number, string> = {
  1: "gray",
  2: "yellow",
  3: "blue",
  4: "purple",
  5: "green",
};

/** Project status options for filters/dropdowns. */
export const PROJECT_STATUSES = ["active", "archived", "draft"] as const;

/** Human-readable labels for project statuses. */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  draft: "Draft",
};

/** Tab definitions for project detail page. */
export const PROJECT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "characters", label: "Characters" },
  { id: "scene-settings", label: "Scene Settings" },
  { id: "production", label: "Production" },
  { id: "delivery", label: "Delivery" },
  { id: "config", label: "Configuration" },
] as const;

/** Tab definitions for character detail page. */
export const CHARACTER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "images", label: "Images" },
  { id: "scenes", label: "Scenes" },
  { id: "assets", label: "Assets" },
  { id: "metadata", label: "Metadata" },
  { id: "settings", label: "Settings" },
] as const;
