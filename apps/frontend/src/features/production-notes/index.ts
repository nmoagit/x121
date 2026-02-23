/**
 * Production Notes & Internal Comments feature public API (PRD-95).
 */

// Components
export { NoteEditor } from "./NoteEditor";
export { NotesPanel } from "./NotesPanel";
export { NoteThread } from "./NoteThread";
export { PinnedNoteBanner } from "./PinnedNoteBanner";
export { VisibilitySelector } from "./VisibilitySelector";

// Hooks
export {
  productionNoteKeys,
  useCreateCategory,
  useCreateNote,
  useDeleteNote,
  useNoteCategories,
  useNoteThread,
  usePinnedNotes,
  useProductionNote,
  useProductionNotes,
  useResolveNote,
  useSearchNotes,
  useTogglePin,
  useUnresolveNote,
  useUpdateNote,
} from "./hooks/use-production-notes";

// Types
export type {
  CreateNoteCategory,
  CreateProductionNote,
  NoteCategory,
  NoteEntityType,
  NoteSearchParams,
  NoteVisibility,
  ProductionNote,
  UpdateProductionNote,
} from "./types";
