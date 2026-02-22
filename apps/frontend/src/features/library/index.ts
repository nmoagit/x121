/**
 * Character library feature public API (PRD-60).
 */

// Components
export { CharacterLibraryBrowser } from "./CharacterLibraryBrowser";
export { ImportDialog } from "./ImportDialog";
export { LibraryCharacterCard } from "./LibraryCharacterCard";
export { LibraryUsagePanel } from "./LibraryUsagePanel";
export { LinkedFieldIndicator } from "./LinkedFieldIndicator";

// Hooks
export {
  libraryKeys,
  useCreateLibraryCharacter,
  useDeleteLibraryCharacter,
  useDeleteLink,
  useImportToProject,
  useLibraryCharacter,
  useLibraryCharacters,
  useLibraryUsage,
  useProjectLinks,
  useUpdateLibraryCharacter,
  useUpdateLinkFields,
} from "./hooks/use-library";

// Types
export type {
  CreateLibraryCharacter,
  FieldSyncStatus,
  ImportCharacterRequest,
  LibraryCharacter,
  LibraryUsageEntry,
  ProjectCharacterLink,
  UpdateLibraryCharacter,
} from "./types";
export { MAX_LINKED_FIELDS, NON_LINKABLE_FIELDS } from "./types";
