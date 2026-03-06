import type { BadgeVariant } from "@/components/primitives/Badge";

export interface Scene {
  id: number;
  character_id: number;
  scene_type_id: number;
  image_variant_id: number | null;
  track_id: number | null;
  status_id: number;
  transition_mode: string;
  total_segments_estimated: number | null;
  total_segments_completed: number;
  actual_duration_secs: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
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
  is_final: boolean;
  notes: string | null;
  qa_status: "pending" | "approved" | "rejected";
  qa_reviewed_by: number | null;
  qa_reviewed_at: string | null;
  qa_rejection_reason: string | null;
  qa_notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

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

const SCENE_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Generating",
  3: "Generated",
  4: "Approved",
  5: "Rejected",
  6: "Delivered",
};

const SCENE_STATUS_BADGE: Record<number, BadgeVariant> = {
  1: "default",
  2: "info",
  3: "warning",
  4: "success",
  5: "danger",
  6: "success",
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

// IMPORTANT: Use `formatBytes` from `@/lib/format` for file sizes.
// Use `formatDuration` from `@/features/video-player/frame-utils` for seconds-based timecodes.
// Do NOT redefine formatting utilities here (DRY-627, DRY-628).
