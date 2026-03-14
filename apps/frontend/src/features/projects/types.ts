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
  /** Which deliverable sections must be complete. NULL = inherit studio default. */
  blocking_deliverables: string[] | null;
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
  blocking_deliverables?: string[];
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
   Character deliverable status (per-character readiness grid)
   -------------------------------------------------------------------------- */

export interface CharacterDeliverableRow {
  id: number;
  name: string;
  group_id: number | null;
  status_id: number;
  images_count: number;
  images_approved: number;
  scenes_total: number;
  scenes_with_video: number;
  scenes_approved: number;
  has_active_metadata: boolean;
  metadata_approval_status: "pending" | "approved" | "rejected" | null;
  has_voice_id: boolean;
  blocking_reasons: string[];
  readiness_pct: number;
  hero_variant_id: number | null;
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
  review_status_id: number;
  /** Best avatar variant ID (hero clothed > hero > approved clothed > approved). */
  hero_variant_id: number | null;
  /** Whether this character is enabled for production workflows. */
  is_enabled: boolean;
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
  /** SHA-256 hex digest of the file content (computed during import). */
  contentHash?: string;
  /** Whether this file already exists in the database (by content hash). */
  isDuplicate?: boolean;
}

/** Summary of hash-based deduplication for an import batch. */
export interface ImportHashSummary {
  /** Total files that were hashed. */
  totalFiles: number;
  /** Files whose content hash matches an existing record. */
  duplicateFiles: number;
  /** Files with new (unseen) content. */
  newFiles: number;
  /** Whether hash computation is still in progress. */
  isHashing: boolean;
}

/** All files for one character, parsed from a folder drop. */
export interface CharacterDropPayload {
  rawName: string;
  /** Group name derived from folder structure (grouped/project imports). */
  groupName?: string;
  assets: DroppedAsset[];
  /** bio.json source file (used for metadata generation). */
  bioJson?: File;
  /** tov.json source file (used for metadata generation). */
  tovJson?: File;
  /** metadata.json file (pre-flattened metadata, takes precedence over bio/tov). */
  metadataJson?: File;
}

/** Result from folder structure detection in FileDropZone. */
export interface FolderDropResult {
  /** Detected folder structure depth. */
  structure: "flat" | "grouped" | "project";
  /** Top-level folder name (potential project name for grouped/project imports). */
  detectedProjectName?: string;
  /** Characters grouped by group name. Empty string key = ungrouped (flat). */
  groupedPayloads: Map<string, CharacterDropPayload[]>;
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
  { id: "review", label: "Review" },
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

/* --------------------------------------------------------------------------
   Section readiness indicators (PRD-128)
   -------------------------------------------------------------------------- */

/** Per-section readiness state. */
export type SectionState = "not_started" | "partial" | "complete" | "error";

/** Readiness data for a single section. */
export interface SectionReadiness {
  state: SectionState;
  label: string;
  tooltip: string;
}

/** The four tracked sections in workflow order. */
export type SectionKey = "metadata" | "images" | "scenes" | "speech";

/** CSS color variable for each section state. */
export const SECTION_STATE_BG: Record<SectionState, string> = {
  not_started: "var(--color-text-muted)",
  partial: "var(--color-action-warning)",
  complete: "var(--color-action-success)",
  error: "var(--color-action-danger)",
};

/** Compute per-section readiness from a deliverable row. */
export function computeSectionReadiness(
  row: CharacterDeliverableRow,
): Record<SectionKey, SectionReadiness> {
  const metadata: SectionReadiness = row.has_active_metadata
    ? row.metadata_approval_status === "approved"
      ? { state: "complete", label: "Metadata", tooltip: "Metadata: Approved" }
      : { state: "partial", label: "Metadata", tooltip: `Metadata: ${row.metadata_approval_status === "rejected" ? "Rejected" : "Pending approval"}` }
    : { state: "not_started", label: "Metadata", tooltip: "Metadata: Not started" };

  const images: SectionReadiness =
    row.images_count === 0
      ? { state: "not_started", label: "Images", tooltip: "Images: No seed images" }
      : row.images_approved >= row.images_count
        ? { state: "complete", label: "Images", tooltip: `Images: ${row.images_approved}/${row.images_count} approved` }
        : { state: "partial", label: "Images", tooltip: `Images: ${row.images_approved}/${row.images_count} approved` };

  const scenes: SectionReadiness =
    row.scenes_total === 0
      ? { state: "not_started", label: "Scenes", tooltip: "Scenes: No scenes assigned" }
      : row.scenes_approved >= row.scenes_total
        ? { state: "complete", label: "Scenes", tooltip: `Scenes: ${row.scenes_approved}/${row.scenes_total} approved` }
        : row.scenes_with_video > 0
          ? { state: "partial", label: "Scenes", tooltip: `Scenes: ${row.scenes_approved}/${row.scenes_with_video} approved, ${row.scenes_with_video}/${row.scenes_total} with video` }
          : { state: "not_started", label: "Scenes", tooltip: `Scenes: 0/${row.scenes_total} with video` };

  const speech: SectionReadiness = row.has_voice_id
    ? { state: "complete", label: "Speech", tooltip: "Speech: Voice configured" }
    : { state: "not_started", label: "Speech", tooltip: "Speech: Not configured" };

  return { metadata, images, scenes, speech };
}
