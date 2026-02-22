/**
 * Collaborative review notes feature (PRD-38).
 *
 * Barrel export for all review-notes types, hooks, and components.
 */

// Types
export type {
  CreateReviewNote,
  CreateReviewTag,
  NoteStatus,
  ReviewNote,
  ReviewNoteTag,
  ReviewTag,
  TagFrequency,
  UpdateReviewNote,
} from "./types";
export {
  NOTE_STATUS_OPEN,
  NOTE_STATUS_RESOLVED,
  NOTE_STATUS_WONT_FIX,
  noteStatusColor,
  noteStatusLabel,
  statusBadgeVariant,
} from "./types";

// Hooks
export {
  reviewNoteKeys,
  useAssignTags,
  useCreateNote,
  useCreateTag,
  useDeleteNote,
  useResolveNote,
  useReviewNotes,
  useReviewTags,
  useUpdateNote,
} from "./hooks/use-review-notes";

// Components
export { NoteTimeline } from "./NoteTimeline";
export { ReviewThread } from "./ReviewThread";
export { TagSelector } from "./TagSelector";
export { VoiceMemoRecorder } from "./VoiceMemoRecorder";
