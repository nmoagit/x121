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
  /** Backend sends `status_id` (number); `status` is mapped on the frontend. */
  status_id: number;
  auto_deliver_on_final: boolean;
  /** Which deliverable sections must be complete. NULL = inherit studio default. */
  blocking_deliverables: string[] | null;
  /** Platform-level default output format profile override. NULL = use platform default. */
  default_format_profile_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Total non-archived characters in the project (from enriched list endpoint). */
  character_count?: number;
  /** Characters with readiness state 'ready' (from enriched list endpoint). */
  characters_ready?: number;
}

/** Map project status_id to a slug string. */
const PROJECT_STATUS_ID_MAP: Record<number, string> = {
  1: "draft",
  2: "active",
  3: "paused",
  4: "completed",
  5: "archived",
  6: "setup",
  7: "delivered",
  8: "closed",
};

/** Resolve project status slug from status_id. */
export function projectStatusSlug(statusId: number): string {
  return PROJECT_STATUS_ID_MAP[statusId] ?? "unknown";
}

export interface CreateProject {
  name: string;
  description?: string;
}

export interface UpdateProject {
  name?: string;
  description?: string;
  status_id?: number;
  auto_deliver_on_final?: boolean;
  blocking_deliverables?: string[];
  default_format_profile_id?: number | null;
}

/* --------------------------------------------------------------------------
   Project stats
   -------------------------------------------------------------------------- */

export interface ProjectStats {
  character_count: number;
  characters_draft: number;
  characters_active: number;
  characters_ready: number;
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
  /** Number of active tracks — each character needs one seed image per track. */
  required_images_count: number;
  scenes_total: number;
  scenes_with_video: number;
  scenes_approved: number;
  has_active_metadata: boolean;
  metadata_approval_status: "pending" | "approved" | "rejected" | null;
  /** The `source` column of the active metadata version (e.g. "generated", "json_import"). */
  metadata_source: string | null;
  /** True when the active metadata version has both source_bio and source_tov populated. */
  has_source_files: boolean;
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
  /** Which deliverable sections must be complete. NULL = inherit from project. */
  blocking_deliverables: string[] | null;
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
  blocking_deliverables?: string[];
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
  /** Which deliverable sections must be complete. NULL = inherit from group/project. */
  blocking_deliverables: string[] | null;
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
  blocking_deliverables?: string[];
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
  { id: "characters", label: "Models" },
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
export type SectionState = "not_started" | "partial" | "info" | "complete" | "error";

/** Readiness data for a single section. */
export interface SectionReadiness {
  state: SectionState;
  label: string;
  tooltip: string;
}

/** The four tracked sections in workflow order. */
export type SectionKey = "metadata" | "images" | "scenes" | "speech";

/** Map blocking reason strings to the section they belong to. */
const BLOCKING_REASON_SECTION: Record<string, SectionKey> = {
  "Missing Seed Image": "images",
  "Images Not Approved": "images",
  "No Scenes": "scenes",
  "Videos Not Approved": "scenes",
  "Missing Metadata": "metadata",
  "Metadata Not Approved": "metadata",
};

/** Filter blocking reasons to only include those for configured blocking sections. */
export function filterBlockingReasons(reasons: string[], blockingDeliverables?: string[]): string[] {
  if (!blockingDeliverables) return reasons;
  return reasons.filter((r) => {
    const section = BLOCKING_REASON_SECTION[r];
    return !section || blockingDeliverables.includes(section);
  });
}

/**
 * Compute readiness percentage from a deliverable row, considering only
 * the sections listed in `blockingDeliverables`. Falls back to the
 * backend-computed value when no deliverables filter is provided.
 */
export function computeReadinessPct(
  row: CharacterDeliverableRow,
  blockingDeliverables?: string[],
  speechOverride?: SpeechCompletenessOverride,
): number {
  if (!blockingDeliverables || blockingDeliverables.length === 0) return row.readiness_pct;

  let sum = 0;
  let count = 0;

  if (blockingDeliverables.includes("metadata")) {
    sum += row.has_active_metadata && (row.metadata_approval_status ?? "pending") === "approved" ? 1 : 0;
    count++;
  }
  if (blockingDeliverables.includes("images")) {
    sum += row.images_count > 0 ? row.images_approved / row.images_count : 0;
    count++;
  }
  if (blockingDeliverables.includes("scenes")) {
    sum += row.scenes_total > 0 ? row.scenes_approved / row.scenes_total : 0;
    count++;
  }
  if (blockingDeliverables.includes("speech")) {
    if (speechOverride) {
      sum += speechOverride.totalSlots > 0 ? speechOverride.completenessPct / 100 : 0;
    } else {
      sum += row.has_voice_id ? 1 : 0;
    }
    count++;
  }

  if (count === 0) return 100;
  return Math.round((sum / count) * 1000) / 10;
}

/** CSS color variable for each section state. */
export const SECTION_STATE_BG: Record<SectionState, string> = {
  not_started: "var(--color-text-muted)",
  partial: "var(--color-action-warning)",
  info: "var(--color-action-primary)",
  complete: "var(--color-action-success)",
  error: "var(--color-action-danger)",
};

/** Optional speech completeness override for enhanced readiness (PRD-136). */
export interface SpeechCompletenessOverride {
  totalSlots: number;
  filledSlots: number;
  completenessPct: number;
}

/** Compute per-section readiness from a deliverable row. */
export function computeSectionReadiness(
  row: CharacterDeliverableRow,
  speechOverride?: SpeechCompletenessOverride,
): Record<SectionKey, SectionReadiness> {
  // Metadata state machine:
  //   Red (error)       — no source files uploaded (bio + tov missing)
  //   Yellow (partial)  — source files imported, pending generation; OR metadata imported externally, pending approval
  //   Blue (info)       — metadata generated (via LLM/script), pending approval
  //   Green (complete)  — approved
  const isGenerated = row.metadata_source === "generated" || row.metadata_source === "llm_refined";
  let metadata: SectionReadiness;
  if (row.has_active_metadata && row.metadata_approval_status === "approved") {
    metadata = { state: "complete", label: "Metadata", tooltip: "Metadata: Approved" };
  } else if (row.has_active_metadata && isGenerated) {
    metadata = { state: "info", label: "Metadata", tooltip: "Metadata: Generated — pending approval" };
  } else if (row.has_active_metadata) {
    // Imported or manual metadata, pending approval
    metadata = { state: "partial", label: "Metadata", tooltip: `Metadata: ${row.metadata_approval_status === "rejected" ? "Rejected" : "Imported — pending approval"}` };
  } else if (row.has_source_files) {
    // Source files uploaded but metadata not yet generated
    metadata = { state: "partial", label: "Metadata", tooltip: "Metadata: Source files uploaded — pending generation" };
  } else {
    // No source files, no metadata
    metadata = { state: "error", label: "Metadata", tooltip: "Metadata: Missing bio/tov source files" };
  }

  // Images: red = missing track seed images, yellow = all tracks covered but not all approved, green = all approved
  const requiredImages = row.required_images_count ?? row.images_count;
  const allTracksCovered = requiredImages > 0 && row.images_count >= requiredImages;
  const images: SectionReadiness =
    !allTracksCovered
      ? { state: "error", label: "Images", tooltip: `Images: ${row.images_count}/${requiredImages} track seed images — missing` }
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

  let speech: SectionReadiness;
  if (speechOverride) {
    const { totalSlots, filledSlots, completenessPct } = speechOverride;
    if (completenessPct >= 100) {
      speech = { state: "complete", label: "Speech", tooltip: `Speech: ${filledSlots}/${totalSlots} slots filled (100%)` };
    } else if (filledSlots > 0) {
      speech = { state: "partial", label: "Speech", tooltip: `Speech: ${filledSlots}/${totalSlots} slots filled (${completenessPct}%)` };
    } else {
      speech = { state: "not_started", label: "Speech", tooltip: `Speech: ${filledSlots}/${totalSlots} slots filled (0%)` };
    }
  } else {
    speech = row.has_voice_id
      ? { state: "complete", label: "Speech", tooltip: "Speech: Voice configured" }
      : { state: "not_started", label: "Speech", tooltip: "Speech: Not configured" };
  }

  return { metadata, images, scenes, speech };
}
