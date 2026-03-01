export interface SceneVideoVersion {
  id: number;
  scene_id: number;
  version_number: number;
  source: "generated" | "imported";
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
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

// IMPORTANT: Use `formatBytes` from `@/lib/format` for file sizes.
// Use `formatDuration` from `@/features/video-player/frame-utils` for seconds-based timecodes.
// Do NOT redefine formatting utilities here (DRY-627, DRY-628).
