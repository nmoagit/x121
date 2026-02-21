/**
 * Workspace feature barrel export (PRD-04).
 */

// Components
export { WorkspaceProvider } from "./WorkspaceProvider";
export { ResetLayoutButton } from "./ResetLayoutButton";

// Hooks
export {
  useWorkspaceStore,
  useWorkspaceQuery,
  useUpdateWorkspace,
  useResetWorkspace,
  useUndoSnapshot,
  useSaveUndoSnapshot,
  workspaceKeys,
} from "./hooks/use-workspace";
export { useAutoSave } from "./useAutoSave";

// Utilities
export { detectDeviceType } from "./deviceDetection";

// Types
export type {
  WorkspaceState,
  UpdateWorkspaceInput,
  LayoutState,
  NavigationState,
  PanelConfig,
  UndoSnapshot,
  SaveUndoSnapshotInput,
  DeviceType,
} from "./types";

export { DEFAULT_LAYOUT_STATE, DEFAULT_NAVIGATION_STATE } from "./types";
