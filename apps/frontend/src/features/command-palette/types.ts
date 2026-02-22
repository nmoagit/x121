/**
 * Command palette types (PRD-31).
 */

/** A command that can be executed from the palette. */
export interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  icon?: string;
  shortcut?: string;
  execute: () => void;
}

/** A single palette result, either a command or an entity. */
export interface PaletteResult {
  type: "command" | "entity";
  command?: PaletteCommand;
  entity?: UserRecentItem;
}

/** Server-side recent item for a user. */
export interface UserRecentItem {
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  access_count: number;
  last_accessed_at: string;
  created_at: string;
  updated_at: string;
}

/** Payload for recording an entity access. */
export interface RecordAccessRequest {
  entity_type: string;
  entity_id: number;
}

/** Query parameters for palette search. */
export interface PaletteSearchParams {
  q?: string;
  limit?: number;
}

/** Category filter for palette results. */
export type PaletteCategory = "all" | "commands" | "entities";

/** Valid entity types that can appear in the command palette (mirrors backend). */
export const VALID_ENTITY_TYPES = [
  "project",
  "character",
  "scene",
  "segment",
  "scene_type",
] as const;

export type PaletteEntityType = (typeof VALID_ENTITY_TYPES)[number];

/** Human-readable labels for entity types. */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: "Project",
  character: "Character",
  scene: "Scene",
  segment: "Segment",
  scene_type: "Scene Type",
};

/** Default number of recent items to fetch. */
export const DEFAULT_RECENT_LIMIT = 10;

/** Maximum number of recent items that can be stored. */
export const MAX_RECENT_ITEMS = 50;
