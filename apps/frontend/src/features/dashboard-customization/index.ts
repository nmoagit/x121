// Components
export { DashboardCustomizationPage } from "./DashboardCustomizationPage";
export { EditModeControls } from "./EditModeControls";
export { LayoutEditor } from "./LayoutEditor";
export { PresetImportDialog } from "./PresetImportDialog";
export { PresetManager } from "./PresetManager";
export { RoleDefaultsAdmin } from "./RoleDefaultsAdmin";
export { WidgetCatalog } from "./WidgetCatalog";
export { WidgetSettingsPanel } from "./WidgetSettingsPanel";

// Hooks
export { useDashboardEditor } from "./hooks/use-dashboard-editor";
export {
  dashboardKeys,
  useActivatePreset,
  useCreatePreset,
  useDashboard,
  useDeletePreset,
  useImportPreset,
  usePresets,
  useRoleDefaults,
  useSaveDashboard,
  useSharePreset,
  useUpdatePreset,
  useUpdateRoleDefault,
  useWidgetCatalog,
} from "./hooks/use-dashboard-customization";

// Types
export type {
  CreateDashboardPreset,
  DashboardLayout,
  DashboardLayoutSource,
  DashboardPreset,
  DashboardRoleDefault,
  LayoutItem,
  SaveDashboardPayload,
  SharePresetResponse,
  UpdateDashboardPreset,
  WidgetCategory,
  WidgetDefinition,
} from "./types";
export {
  GRID_COLS_DESKTOP,
  GRID_COLS_MOBILE,
  GRID_COLS_TABLET,
  WIDGET_CATEGORY_ICON,
  WIDGET_CATEGORY_LABEL,
} from "./types";
