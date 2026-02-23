/**
 * Project Configuration Templates feature public API (PRD-74).
 */

// Components
export { ConfigDiffView } from "./ConfigDiffView";
export { ConfigLibrary } from "./ConfigLibrary";
export { SelectiveImport } from "./SelectiveImport";

// Hooks
export {
  configTemplateKeys,
  useConfigDiff,
  useConfigTemplate,
  useConfigTemplates,
  useCreateConfig,
  useDeleteConfig,
  useExportConfig,
  useImportConfig,
  useRecommendedConfigs,
  useUpdateConfig,
} from "./hooks/use-config-templates";

// Types
export type {
  ConfigDiffEntry,
  CreateProjectConfig,
  DiffStatus,
  ImportConfigRequest,
  ImportResult,
  ProjectConfig,
  UpdateProjectConfig,
} from "./types";
