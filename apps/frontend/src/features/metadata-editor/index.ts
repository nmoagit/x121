/**
 * Barrel export for avatar metadata editor feature (PRD-66).
 */

export { MetadataForm } from "./MetadataForm";
export { CompletenessBar } from "./CompletenessBar";
export { MetadataSpreadsheet } from "./MetadataSpreadsheet";
export { BulkEditDialog } from "./BulkEditDialog";
export { CsvExport } from "./CsvExport";
export { CsvImport } from "./CsvImport";
export {
  metadataEditorKeys,
  useAvatarMetadata,
  useAvatarCompleteness,
  useUpdateAvatarMetadata,
  useProjectMetadata,
  useProjectCompleteness,
  exportMetadataCsv,
  useImportMetadataCsv,
} from "./hooks/use-metadata-editor";
export type {
  FieldType,
  FieldCategory,
  MetadataFieldDef,
  MetadataFieldWithValue,
  CompletenessResult,
  ProjectCompleteness,
  AvatarMetadataResponse,
  MetadataUpdateResult,
  MetadataValidationFailure,
  MetadataFieldError,
  CsvDiffEntry,
  CsvRecordError,
  CsvImportPreview,
} from "./types";
