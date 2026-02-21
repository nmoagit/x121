/**
 * TypeScript types for workspace state persistence (PRD-04).
 *
 * These types mirror the backend `workspace_states` and `undo_snapshots`
 * table schemas.
 */

/* --------------------------------------------------------------------------
   Panel / Layout Types
   -------------------------------------------------------------------------- */

export interface PanelConfig {
  id: string;
  isVisible: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  order: number;
}

export interface LayoutState {
  panels: Record<string, PanelConfig>;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

/* --------------------------------------------------------------------------
   Navigation Types
   -------------------------------------------------------------------------- */

export interface NavigationState {
  activeProjectId: number | null;
  activeCharacterId: number | null;
  activeSceneId: number | null;
  activeSegmentId: number | null;
  scrollPositions: Record<string, number>;
  zoomLevel: number;
  videoPlaybackPosition: number;
}

/* --------------------------------------------------------------------------
   Workspace State (from backend)
   -------------------------------------------------------------------------- */

export interface WorkspaceState {
  id: number;
  user_id: number;
  device_type: string;
  layout_state: LayoutState;
  navigation_state: NavigationState;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Update DTO (matches backend UpdateWorkspaceState)
   -------------------------------------------------------------------------- */

export interface UpdateWorkspaceInput {
  layout_state?: Partial<LayoutState>;
  navigation_state?: Partial<NavigationState>;
  preferences?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Undo Snapshot Types
   -------------------------------------------------------------------------- */

export interface UndoSnapshot {
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  snapshot_data: Record<string, unknown>;
  snapshot_size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface SaveUndoSnapshotInput {
  snapshot_data: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Device Types
   -------------------------------------------------------------------------- */

export type DeviceType = "desktop" | "tablet" | "mobile";

/* --------------------------------------------------------------------------
   Defaults
   -------------------------------------------------------------------------- */

export const DEFAULT_LAYOUT_STATE: LayoutState = {
  panels: {},
  sidebarWidth: 280,
  sidebarCollapsed: false,
};

export const DEFAULT_NAVIGATION_STATE: NavigationState = {
  activeProjectId: null,
  activeCharacterId: null,
  activeSceneId: null,
  activeSegmentId: null,
  scrollPositions: {},
  zoomLevel: 1,
  videoPlaybackPosition: 0,
};
