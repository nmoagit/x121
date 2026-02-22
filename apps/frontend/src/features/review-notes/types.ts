/**
 * TypeScript types for the collaborative review notes system (PRD-38).
 *
 * These types mirror the backend API response shapes for review notes,
 * review tags, and their associations.
 */

/* --------------------------------------------------------------------------
   Note status
   -------------------------------------------------------------------------- */

export type NoteStatus = "open" | "resolved" | "wont_fix";

export const NOTE_STATUS_OPEN: NoteStatus = "open";
export const NOTE_STATUS_RESOLVED: NoteStatus = "resolved";
export const NOTE_STATUS_WONT_FIX: NoteStatus = "wont_fix";

/* --------------------------------------------------------------------------
   Review tags
   -------------------------------------------------------------------------- */

export interface ReviewTag {
  id: number;
  name: string;
  color: string;
  category: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewTag {
  name: string;
  color?: string;
  category?: string;
}

/* --------------------------------------------------------------------------
   Review notes
   -------------------------------------------------------------------------- */

export interface ReviewNote {
  id: number;
  segment_id: number;
  user_id: number;
  parent_note_id: number | null;
  timecode: string | null;
  frame_number: number | null;
  text_content: string | null;
  voice_memo_path: string | null;
  voice_memo_transcript: string | null;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewNote {
  segment_id: number;
  parent_note_id?: number;
  timecode?: string;
  frame_number?: number;
  text_content?: string;
  voice_memo_path?: string;
  tag_ids?: number[];
}

export interface UpdateReviewNote {
  text_content?: string;
  status?: NoteStatus;
}

/* --------------------------------------------------------------------------
   Note-tag associations
   -------------------------------------------------------------------------- */

export interface ReviewNoteTag {
  id: number;
  note_id: number;
  tag_id: number;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Aggregation types
   -------------------------------------------------------------------------- */

export interface TagFrequency {
  tag_id: number;
  tag_name: string;
  count: number;
}

/* --------------------------------------------------------------------------
   Helper functions
   -------------------------------------------------------------------------- */

/** Map a note status to a human-readable label. */
export function noteStatusLabel(status: NoteStatus): string {
  switch (status) {
    case NOTE_STATUS_OPEN:
      return "Open";
    case NOTE_STATUS_RESOLVED:
      return "Resolved";
    case NOTE_STATUS_WONT_FIX:
      return "Won't Fix";
    default:
      return status;
  }
}

/** Map a note status to a Badge variant for display. */
export function statusBadgeVariant(
  status: string,
): "success" | "warning" | "default" {
  switch (status) {
    case NOTE_STATUS_RESOLVED:
      return "success";
    case NOTE_STATUS_OPEN:
      return "warning";
    default:
      return "default";
  }
}

/** Map a note status to a Tailwind-compatible color token. */
export function noteStatusColor(status: NoteStatus): string {
  switch (status) {
    case NOTE_STATUS_OPEN:
      return "var(--color-status-warning)";
    case NOTE_STATUS_RESOLVED:
      return "var(--color-status-success)";
    case NOTE_STATUS_WONT_FIX:
      return "var(--color-text-muted)";
    default:
      return "var(--color-text-muted)";
  }
}
