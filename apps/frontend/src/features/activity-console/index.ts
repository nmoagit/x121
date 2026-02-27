/**
 * Activity Console feature barrel export (PRD-118).
 */

// Components
export { ActivityConsolePage } from "./ActivityConsolePage";
export { ActivityConsolePanel } from "./ActivityConsolePanel";

// Hooks
export {
  activityLogKeys,
  useActivityLogHistory,
  useActivityLogSettings,
  useUpdateActivityLogSettings,
} from "./hooks/useActivityLogHistory";
export { useActivityLogStream } from "./hooks/useActivityLogStream";

// Store
export { useActivityConsoleStore } from "./stores/useActivityConsoleStore";

// Types
export type {
  ActivityLogCategory,
  ActivityLogEntry,
  ActivityLogLaggedMessage,
  ActivityLogLevel,
  ActivityLogPage,
  ActivityLogQueryParams,
  ActivityLogSettings,
  ActivityLogSource,
  UpdateActivityLogSettings,
  WsConnectionStatus,
  WsMessage,
} from "./types";
export {
  ALL_LEVELS,
  ALL_SOURCES,
  LEVEL_BADGE_VARIANT,
  LEVEL_LABELS,
  SOURCE_ACCENT_CLASSES,
  SOURCE_LABELS,
} from "./types";
