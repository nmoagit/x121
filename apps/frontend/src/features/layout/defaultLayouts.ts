/**
 * Default layout configurations per role (PRD-30).
 *
 * These are used as fallback layouts when a user has no saved layouts
 * and no admin preset is assigned for their role.
 */

import type { PanelState } from "./types";

/** Default layout for admin users -- three-column with monitoring panel. */
export const ADMIN_DEFAULT_LAYOUT: PanelState[] = [
  {
    id: "admin-panel-1",
    position: { x: 0, y: 0 },
    size: { width: 400, height: 600 },
    collapsed: false,
    viewModule: "project-browser",
  },
  {
    id: "admin-panel-2",
    position: { x: 420, y: 0 },
    size: { width: 600, height: 600 },
    collapsed: false,
    viewModule: "viewport",
  },
  {
    id: "admin-panel-3",
    position: { x: 1040, y: 0 },
    size: { width: 360, height: 600 },
    collapsed: false,
    viewModule: "properties",
  },
];

/** Default layout for creator users -- two-column workspace. */
export const CREATOR_DEFAULT_LAYOUT: PanelState[] = [
  {
    id: "creator-panel-1",
    position: { x: 0, y: 0 },
    size: { width: 300, height: 600 },
    collapsed: false,
    viewModule: "project-browser",
  },
  {
    id: "creator-panel-2",
    position: { x: 320, y: 0 },
    size: { width: 700, height: 600 },
    collapsed: false,
    viewModule: "viewport",
  },
  {
    id: "creator-panel-3",
    position: { x: 1040, y: 0 },
    size: { width: 360, height: 600 },
    collapsed: false,
    viewModule: "properties",
  },
];

/** Default layout for reviewer users -- read-only review focus. */
export const REVIEWER_DEFAULT_LAYOUT: PanelState[] = [
  {
    id: "reviewer-panel-1",
    position: { x: 0, y: 0 },
    size: { width: 800, height: 600 },
    collapsed: false,
    viewModule: "viewport",
  },
  {
    id: "reviewer-panel-2",
    position: { x: 820, y: 0 },
    size: { width: 400, height: 600 },
    collapsed: false,
    viewModule: "properties",
  },
];

/** Map of role names to their default layout. */
const ROLE_DEFAULTS: Record<string, PanelState[]> = {
  admin: ADMIN_DEFAULT_LAYOUT,
  creator: CREATOR_DEFAULT_LAYOUT,
  reviewer: REVIEWER_DEFAULT_LAYOUT,
};

/**
 * Get the default layout for a given role.
 *
 * Returns the creator layout as fallback for unknown roles.
 */
export function getDefaultLayoutForRole(role: string): PanelState[] {
  return ROLE_DEFAULTS[role] ?? CREATOR_DEFAULT_LAYOUT;
}
