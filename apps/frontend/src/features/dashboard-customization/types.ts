/**
 * TypeScript types for Dashboard Widget Customization (PRD-89).
 *
 * These types mirror the backend API response shapes for dashboard presets,
 * widget definitions, layout items, and role defaults.
 */

/* -- Widget category ------------------------------------------------------- */

export type WidgetCategory = "monitoring" | "productivity" | "reporting" | "system";

/* -- Widget definition ----------------------------------------------------- */

/** A widget available in the catalog (native or extension-provided). */
export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  default_width: number;
  default_height: number;
  min_width: number;
  min_height: number;
  settings_schema: Record<string, unknown> | null;
  source: string; // "native" or extension ID
}

/* -- Layout ---------------------------------------------------------------- */

/** Position and size of a widget instance within the grid. */
export interface LayoutItem {
  widget_id: string;
  instance_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* -- Dashboard preset ------------------------------------------------------ */

/** User-owned dashboard preset with layout and per-widget settings. */
export interface DashboardPreset {
  id: number;
  user_id: number;
  name: string;
  layout_json: LayoutItem[];
  widget_settings_json: Record<string, Record<string, unknown>>;
  is_active: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

/* -- Mutation inputs -------------------------------------------------------- */

/** Payload for creating a new dashboard preset. */
export interface CreateDashboardPreset {
  name: string;
  layout_json: LayoutItem[];
  widget_settings_json?: Record<string, Record<string, unknown>>;
}

/** Payload for partially updating an existing dashboard preset. */
export interface UpdateDashboardPreset {
  name?: string;
  layout_json?: LayoutItem[];
  widget_settings_json?: Record<string, Record<string, unknown>>;
}

/* -- Role defaults --------------------------------------------------------- */

/** Admin-configured default dashboard layout for a given role. */
export interface DashboardRoleDefault {
  id: number;
  role_name: string;
  layout_json: LayoutItem[];
  widget_settings_json: Record<string, Record<string, unknown>>;
  configured_by: number | null;
  created_at: string;
  updated_at: string;
}

/* -- Resolved dashboard ---------------------------------------------------- */

/** Layout source indicating which priority level provided the active layout. */
export type DashboardLayoutSource = "preset" | "role_default" | "platform_default";

/** The fully resolved layout the current user should see. */
export interface DashboardLayout {
  layout: LayoutItem[];
  widget_settings: Record<string, Record<string, unknown>>;
  source: DashboardLayoutSource;
}

/** Payload for saving the user's dashboard layout (maps to CreateDashboardPreset on backend). */
export interface SaveDashboardPayload {
  name: string;
  layout_json: LayoutItem[];
  widget_settings_json?: Record<string, Record<string, unknown>>;
}

/** Response from the share-preset endpoint. */
export interface SharePresetResponse {
  share_token: string | null;
  preset_id: number;
}

/* -- Display constants ----------------------------------------------------- */

/** Human-readable labels for widget categories. */
export const WIDGET_CATEGORY_LABEL: Record<WidgetCategory, string> = {
  monitoring: "Monitoring",
  productivity: "Productivity",
  reporting: "Reporting",
  system: "System",
};

/** Icon identifiers for widget categories (lucide icon names). */
export const WIDGET_CATEGORY_ICON: Record<WidgetCategory, string> = {
  monitoring: "Activity",
  productivity: "Zap",
  reporting: "BarChart3",
  system: "Settings",
};

/* -- Grid constants -------------------------------------------------------- */

/** Number of columns in the desktop dashboard grid. */
export const GRID_COLS_DESKTOP = 4;

/** Number of columns in the tablet dashboard grid. */
export const GRID_COLS_TABLET = 2;

/** Number of columns in the mobile dashboard grid. */
export const GRID_COLS_MOBILE = 1;
