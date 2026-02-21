/**
 * Layout feature barrel export (PRD-30).
 */

// Components
export { PanelContainer } from "./PanelContainer";
export { PanelDropZone } from "./PanelDropZone";
export { PanelHeader } from "./PanelHeader";
export { PresetSwitcher } from "./PresetSwitcher";

// Hooks
export { useLayoutPersistence } from "./useLayoutPersistence";
export { useLayoutStore } from "./useLayoutStore";
export { usePanelResize } from "./usePanelResize";
export { useSnapGrid, snapToGrid, snapValue } from "./useSnapGrid";

// Utilities
export { getDefaultLayoutForRole } from "./defaultLayouts";
export { serializeLayout, deserializeLayout } from "./layoutSerializer";
export {
  registerViewModule,
  getViewModule,
  getAllViewModules,
} from "./viewModuleRegistry";

// Types
export type { PanelState, PanelPosition, PanelSize } from "./types";
export type { ViewModuleRegistration } from "./viewModuleRegistry";
export type { ResizeDirection } from "./usePanelResize";
