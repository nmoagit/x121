/**
 * Command palette feature public API (PRD-31).
 */

// Components
export { CommandPalette } from "./CommandPalette";
export { PaletteResult } from "./PaletteResult";
export { RecentItems } from "./RecentItems";

// Registry
export { CommandRegistry, commandRegistry } from "./commandRegistry";

// Scoring
export {
  calculateFrecencyScore,
  getRecencyWeight,
  sortByFrecency,
} from "./frecencyScorer";

// Hooks
export {
  paletteKeys,
  useClearRecent,
  usePaletteSearch,
  useRecentItems,
  useRecordAccess,
} from "./hooks/use-command-palette";
export { useKeyboardNavigation } from "./hooks/useKeyboardNavigation";

// Types
export type {
  PaletteCategory,
  PaletteCommand,
  PaletteEntityType,
  PaletteResult as PaletteResultType,
  PaletteSearchParams,
  RecordAccessRequest,
  UserRecentItem,
} from "./types";
export {
  DEFAULT_RECENT_LIMIT,
  ENTITY_TYPE_LABELS,
  MAX_RECENT_ITEMS,
  VALID_ENTITY_TYPES,
} from "./types";
