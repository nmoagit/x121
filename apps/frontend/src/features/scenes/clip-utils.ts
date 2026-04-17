/**
 * Shared utilities for converting browse clip items to playable versions.
 */

import type { ClipBrowseItem } from "./hooks/useClipManagement";
import type { SceneVideoVersion } from "./types";

/** Convert a ClipBrowseItem (from browse API) to a SceneVideoVersion (for playback).
 *
 * The wider `string` types produced by ts-rs generation (ADR-003) are
 * narrowed to the hand-curated unions on `SceneVideoVersion`. The backend
 * only emits the four transcode states and two source types, so the cast
 * is safe — a defensive runtime check would fail louder, but the current
 * design relies on the contract.
 */
export function clipBrowseToPlayable(clip: ClipBrowseItem): SceneVideoVersion {
  return {
    id: clip.id,
    scene_id: clip.scene_id,
    version_number: clip.version_number,
    source: clip.source as SceneVideoVersion["source"],
    file_path: clip.file_path,
    file_size_bytes: clip.file_size_bytes,
    duration_secs: clip.duration_secs,
    width: clip.width,
    height: clip.height,
    frame_rate: clip.frame_rate,
    preview_path: clip.preview_path,
    video_codec: null,
    is_final: clip.is_final,
    notes: clip.notes,
    qa_status: clip.qa_status as SceneVideoVersion["qa_status"],
    qa_reviewed_by: null,
    qa_reviewed_at: null,
    qa_rejection_reason: clip.qa_rejection_reason,
    qa_notes: clip.qa_notes,
    generation_snapshot: clip.generation_snapshot,
    file_purged: clip.file_purged,
    deleted_at: null,
    created_at: clip.created_at,
    updated_at: clip.created_at,
    annotation_count: clip.annotation_count,
    parent_version_id: clip.parent_version_id,
    clip_index: clip.clip_index,
    transcode_state: clip.transcode_state as SceneVideoVersion["transcode_state"],
    transcode_error: clip.transcode_error,
    transcode_started_at: clip.transcode_started_at,
    transcode_attempts: clip.transcode_attempts,
    transcode_job_id: clip.transcode_job_id,
  };
}
