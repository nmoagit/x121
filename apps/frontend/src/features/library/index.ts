/**
 * Avatar library feature public API (PRD-60).
 */

// Components
export { AvatarLibraryBrowser } from "./AvatarLibraryBrowser";
export { ImportDialog } from "./ImportDialog";
export { LibraryAvatarCard } from "./LibraryAvatarCard";
export { LibraryUsagePanel } from "./LibraryUsagePanel";
export { LinkedFieldIndicator } from "./LinkedFieldIndicator";

// Hooks
export {
  libraryKeys,
  useLibraryAvatars,
} from "./hooks/use-library";

// Types
export type {
  LibraryAvatar,
} from "./types";
