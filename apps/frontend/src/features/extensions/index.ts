/**
 * Extension system barrel export (PRD-85).
 */

// Components
export { ExtensionSandbox } from "./ExtensionSandbox";
export { ExtensionPanelIntegration } from "./ExtensionPanelIntegration";
export { ExtensionMenuItem, useExtensionMenuItems } from "./ContextMenuInjection";
export { MetadataRendererOverride } from "./MetadataRendererOverride";
export { ExtensionManager } from "./ExtensionManager";

// Bridge
export { ExtensionApiBridge } from "./ExtensionApiBridge";

// Hooks
export {
  extensionKeys,
  useExtensions,
  useExtension,
  useExtensionRegistry,
  useInstallExtension,
  useUpdateExtensionSettings,
  useUninstallExtension,
  useEnableExtension,
  useDisableExtension,
} from "./hooks/use-extensions";

// Types
export type {
  Extension,
  ExtensionManifest,
  Permission,
  PanelRegistration,
  MenuItemRegistration,
  MetadataRendererRegistration,
  ExtensionApiRequest,
  ExtensionApiResponse,
  PlatformContext,
} from "./types";
