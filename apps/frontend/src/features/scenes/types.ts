import type { BadgeVariant } from "@/components/primitives/Badge";
import type { ExpandedSceneSetting } from "@/features/scene-catalogue/types";

export interface Scene {
  id: number;
  avatar_id: number;
  scene_type_id: number;
  media_variant_id: number | null;
  track_id: number | null;
  status_id: number;
  transition_mode: string;
  total_segments_estimated: number | null;
  total_segments_completed: number;
  actual_duration_secs: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Best video version ID (final preferred, else highest version_number). */
  latest_version_id: number | null;
  /** Total number of non-deleted video versions. */
  version_count: number;
  /** True when a final version exists but newer versions follow it. */
  has_newer_than_final: boolean;
}

export interface SceneVideoVersion {
  id: number;
  scene_id: number;
  version_number: number;
  source: "generated" | "imported";
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  preview_path: string | null;
  video_codec: string | null;
  is_final: boolean;
  notes: string | null;
  qa_status: "pending" | "approved" | "rejected";
  qa_reviewed_by: number | null;
  qa_reviewed_at: string | null;
  qa_rejection_reason: string | null;
  qa_notes: string | null;
  generation_snapshot: Record<string, unknown> | null;
  file_purged: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Number of annotated frames on this version (computed by backend). */
  annotation_count: number;
  /** Self-referencing FK to parent clip (for derived clips). NULL for non-derived. */
  parent_version_id: number | null;
  /** Sequential ordering for derived clips (chunk index). NULL for non-derived. */
  clip_index: number | null;
  /** Transcode surface state (PRD-169). `completed` for browser-playable videos. */
  transcode_state: "pending" | "in_progress" | "completed" | "failed";
  /** Latest transcode error message (PRD-169). Populated when failed. */
  transcode_error?: string | null;
  /** Latest transcode started_at (PRD-169). */
  transcode_started_at?: string | null;
  /** Latest transcode attempt count (PRD-169). */
  transcode_attempts?: number | null;
  /** Latest transcode job id — used by POST /transcode-jobs/{id}/retry. */
  transcode_job_id?: number | null;
}

export interface SceneVideoVersionArtifact {
  id: number;
  version_id: number;
  role: "final" | "intermediate";
  label: string;
  node_id: string | null;
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  file_purged: boolean;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Artifact role helpers (shared by ArtifactTimeline card + modal)
   -------------------------------------------------------------------------- */

type ArtifactRole = SceneVideoVersionArtifact["role"];

export const ARTIFACT_ROLE_VARIANT: Record<ArtifactRole, BadgeVariant> = {
  final: "success",
  intermediate: "info",
};

export const ARTIFACT_ROLE_LABEL: Record<ArtifactRole, string> = {
  final: "Final",
  intermediate: "Intermediate",
};

export interface RejectClipInput {
  reason: string;
  notes?: string;
}

export interface ResumeFromResponse {
  scene_id: number;
  resume_from_version: number;
  segments_preserved: number;
  segments_discarded: number;
  status: string;
}

export type QaStatus = "pending" | "approved" | "rejected";

export function qaStatusLabel(status: QaStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

export function qaStatusColor(status: QaStatus): string {
  switch (status) {
    case "pending":
      return "var(--color-text-muted)";
    case "approved":
      return "var(--color-action-primary)";
    case "rejected":
      return "var(--color-action-danger)";
  }
}

/* --------------------------------------------------------------------------
   Scene status helpers (mirrors scene_statuses lookup table)
   -------------------------------------------------------------------------- */

/** Status ID constants from scene_statuses lookup table. */
export const SCENE_STATUS_PENDING = 1;
export const SCENE_STATUS_GENERATING = 2;
export const SCENE_STATUS_GENERATED = 3;
export const SCENE_STATUS_APPROVED = 4;
export const SCENE_STATUS_REJECTED = 5;
export const SCENE_STATUS_DELIVERED = 6;
export const SCENE_STATUS_FAILED = 7;
export const SCENE_STATUS_SCHEDULED = 8;

const SCENE_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Generating",
  3: "Review",
  4: "Approved",
  5: "Rejected",
  6: "Delivered",
  7: "Failed",
  8: "Scheduled",
};

const SCENE_STATUS_BADGE: Record<number, BadgeVariant> = {
  1: "default",
  2: "info",
  3: "warning",
  4: "success",
  5: "danger",
  6: "success",
  7: "danger",
  8: "info",
};

export function sceneStatusLabel(statusId: number): string {
  return SCENE_STATUS_LABELS[statusId] ?? "Unknown";
}

export function sceneStatusBadgeVariant(statusId: number): BadgeVariant {
  return SCENE_STATUS_BADGE[statusId] ?? "default";
}

/** Returns true if a scene has existing video content (generated, approved, or delivered). */
export function sceneHasVideo(scene: Scene): boolean {
  return scene.status_id >= SCENE_STATUS_GENERATED;
}

/* --------------------------------------------------------------------------
   Clip helpers (shared by AvatarDeliverablesTab, SequencePlayer, ClipCard)
   -------------------------------------------------------------------------- */

/**
 * Build the "SceneName -- TrackName" display label for a scene slot.
 * When the slot has the clothes-off transition flag, the track label
 * is replaced with "Clothes-off".
 */
export function slotLabel(slot: ExpandedSceneSetting): string {
  if (slot.has_clothes_off_transition) return `${slot.name} \u2014 Clothes-off`;
  return slot.track_name ? `${slot.name} \u2014 ${slot.track_name}` : slot.name;
}

/**
 * Pick the best final clip from a list of versions.
 * Returns the final clip with the highest version_number, or null if none are final.
 */
export function pickFinalClip(clips: SceneVideoVersion[]): SceneVideoVersion | null {
  const finals = clips.filter((c) => c.is_final);
  if (finals.length === 0) return null;
  return finals.reduce((a, b) => (b.version_number > a.version_number ? b : a));
}

/**
 * Returns true if a clip has no actual file content (empty or missing file_size_bytes).
 * Used to render the "Empty file" warning badge.
 * Accepts any object with a `file_size_bytes` field (SceneVideoVersion or ClipBrowseItem).
 */
export function isEmptyClip(clip: { file_size_bytes: number | null }): boolean {
  return clip.file_size_bytes === 0 || clip.file_size_bytes == null;
}

/** Returns true if the clip's video file has been purged from disk.
 * Accepts any object with a `file_purged` field (SceneVideoVersion or ClipBrowseItem).
 */
export function isPurgedClip(clip: { file_purged: boolean }): boolean {
  return clip.file_purged;
}

// IMPORTANT: Use `formatBytes` from `@/lib/format` for file sizes.
// Use `formatDuration` from `@/features/video-player/frame-utils` for seconds-based timecodes.
// Do NOT redefine formatting utilities here (DRY-627, DRY-628).
