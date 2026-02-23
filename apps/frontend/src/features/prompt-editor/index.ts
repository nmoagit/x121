/**
 * Prompt Editor & Versioning feature public API (PRD-63).
 */

// Components
export { LivePreview } from "./LivePreview";
export { PromptEditor } from "./PromptEditor";
export { PromptLibraryBrowser } from "./PromptLibraryBrowser";
export { VersionTimeline } from "./VersionTimeline";

// Hooks
export {
  promptVersionKeys,
  useDiffVersions,
  usePromptVersions,
  useRestoreVersion,
  useSavePromptVersion,
} from "./hooks/use-prompt-editor";

export {
  promptLibraryKeys,
  useCreateLibraryEntry,
  useDeleteLibraryEntry,
  useLibraryEntry,
  usePromptLibrary,
  useRateLibraryEntry,
  useUpdateLibraryEntry,
} from "./hooks/use-prompt-library";

// Types
export type {
  CreateLibraryEntryRequest,
  CreatePromptVersionRequest,
  PromptDiff,
  PromptLibraryEntry,
  PromptVersion,
  UpdateLibraryEntryRequest,
} from "./types";

export {
  MAX_NEGATIVE_PROMPT_LENGTH,
  MAX_PROMPT_LENGTH,
  PLACEHOLDER_REGEX,
} from "./types";
