/**
 * Legacy Data Import & Migration Toolkit feature public API (PRD-86).
 */

// Components
export { CsvImportDialog } from "./CsvImportDialog";
export { GapAnalysisPanel } from "./GapAnalysisPanel";
export { ImportPreview } from "./ImportPreview";
export { ImportProgress } from "./ImportProgress";
export { LegacyImportWizard } from "./LegacyImportWizard";
export { MappingConfig } from "./MappingConfig";
export { SourceSelection } from "./SourceSelection";

// Hooks
export {
  legacyImportKeys,
  useCommitImport,
  useCreateRun,
  useCsvImport,
  useEntityLogs,
  useGapReport,
  useImportRun,
  useImportRuns,
  usePreviewImport,
  useRunReport,
  useScanFolder,
} from "./hooks/use-legacy-import";

// Types
export type {
  ActionCount,
  CommitImportRequest,
  CreateImportRun,
  CsvImportRequest,
  EntityAction,
  EntityLog,
  GapEntry,
  GapReport,
  ImportRunStatus,
  InferredEntity,
  LegacyImportRun,
  MatchKey,
  PathMappingRule,
  PreviewImportRequest,
  RunReport,
  ScanFolderRequest,
} from "./types";
