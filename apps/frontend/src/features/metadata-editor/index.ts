/**
 * Barrel export for character metadata editor feature (PRD-66).
 */

export { MetadataForm } from "./MetadataForm";
export { CompletenessBar } from "./CompletenessBar";
export { MetadataSpreadsheet } from "./MetadataSpreadsheet";
export { BulkEditDialog } from "./BulkEditDialog";
export { CsvExport } from "./CsvExport";
export { CsvImport } from "./CsvImport";
export {
  metadataEditorKeys,
  useCharacterMetadata,
  useCharacterCompleteness,
  useUpdateCharacterMetadata,
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
  CharacterMetadataResponse,
  MetadataUpdateResult,
  MetadataValidationFailure,
  MetadataFieldError,
  CsvDiffEntry,
  CsvRecordError,
  CsvImportPreview,
} from "./types";
