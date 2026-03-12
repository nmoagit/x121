/**
 * Activity Console feature barrel export (PRD-118).
 */

// Components
export { ActivityConsolePage } from "./ActivityConsolePage";
export { ActivityConsolePanel } from "./ActivityConsolePanel";
export { FilteredActivityLog } from "./components/FilteredActivityLog";

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
  ActivityLogRow,
  ActivityLogSettings,
  ActivityLogSource,
  UpdateActivityLogSettings,
  WsClientAction,
  WsConnectionStatus,
  WsMessage,
} from "./types";
export {
  ALL_LEVELS,
  ALL_SOURCES,
  formatLogTime,
  LEVEL_BADGE_VARIANT,
  LEVEL_ID_MAP,
  LEVEL_LABELS,
  SOURCE_ACCENT_CLASSES,
  SOURCE_ID_MAP,
  SOURCE_LABELS,
} from "./types";
