/**
 * TypeScript types for project hub & management (PRD-112).
 *
 * These types mirror the backend API response shapes.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Project
   -------------------------------------------------------------------------- */

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  auto_deliver_on_final: boolean;
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
  auto_deliver_on_final?: boolean;
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
   Folder-drop import payloads
   -------------------------------------------------------------------------- */

/** A file classified from a dropped character folder. */
export interface DroppedAsset {
  file: File;
  /** For images: variant_type (e.g. "topless"). For videos: raw filename stem. */
  category: string;
  kind: "image" | "video";
}

/** All files for one character, parsed from a folder drop. */
export interface CharacterDropPayload {
  rawName: string;
  assets: DroppedAsset[];
  /** bio.json source file (used for metadata generation). */
  bioJson?: File;
  /** tov.json source file (used for metadata generation). */
  tovJson?: File;
  /** metadata.json file (pre-flattened metadata, takes precedence over bio/tov). */
  metadataJson?: File;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Character status_id for Draft. */
export const CHARACTER_STATUS_ID_DRAFT = 1;

/** Character status_id for Active (VoiceID gate, PRD-013 A.4). */
export const CHARACTER_STATUS_ID_ACTIVE = 2;

/** Character status_id for Archived (used to exclude from production queues, A.3). */
export const CHARACTER_STATUS_ID_ARCHIVED = 3;

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
  { id: "production", label: "Production" },
  { id: "delivery", label: "Delivery" },
  { id: "settings", label: "Settings" },
] as const;

/** Tab definitions for character detail page. */
export const CHARACTER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "images", label: "Images" },
  { id: "scenes", label: "Scenes" },
  { id: "metadata", label: "Metadata" },
  { id: "speech", label: "Speech" },
  { id: "deliverables", label: "Deliverables" },
  { id: "settings", label: "Settings" },
] as const;

/* --------------------------------------------------------------------------
   Badge variant helpers (shared by ProjectCard, ProjectDetailPage,
   CharacterCard, CharacterDetailPage, CharacterOverviewTab)
   -------------------------------------------------------------------------- */

/** Project status string -> Badge variant. */
export const PROJECT_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active: "success",
  archived: "default",
  draft: "warning",
};

/** Intermediate color string -> Badge variant (for character status_id). */
const COLOR_TO_VARIANT: Record<string, BadgeVariant> = {
  gray: "default",
  yellow: "warning",
  blue: "info",
  purple: "info",
  green: "success",
};

/** Derive a human-readable label from a character status_id. */
export function characterStatusLabel(statusId: number | null): string {
  if (statusId === null) return "No Status";
  return STATUS_LABELS[statusId] ?? "Unknown";
}

/** Derive a BadgeVariant from a character status_id. */
export function characterStatusBadgeVariant(statusId: number | null): BadgeVariant {
  if (statusId === null) return "default";
  const color = STATUS_COLORS[statusId] ?? "gray";
  return COLOR_TO_VARIANT[color] ?? "default";
}
