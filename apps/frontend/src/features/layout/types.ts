/**
 * Shared types for the layout & panel management system (PRD-30).
 */

/** Position coordinates for a panel on the grid. */
export interface PanelPosition {
  x: number;
  y: number;
}

/** Size dimensions for a panel. */
export interface PanelSize {
  width: number;
  height: number;
}

/** The complete state of a single panel instance. */
export interface PanelState {
  id: string;
  position: PanelPosition;
  size: PanelSize;
  collapsed: boolean;
  viewModule: string;
  viewProps?: Record<string, unknown>;
}

/** Minimum panel size constraints (in pixels). */
export const MIN_PANEL_WIDTH = 200;
export const MIN_PANEL_HEIGHT = 100;

/** Maximum panel size constraints (in pixels). */
export const MAX_PANEL_WIDTH = 2400;
export const MAX_PANEL_HEIGHT = 1600;

/** Default snap-to-grid size (in pixels). */
export const DEFAULT_GRID_SIZE = 20;
