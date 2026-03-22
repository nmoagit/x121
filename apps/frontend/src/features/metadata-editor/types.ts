/**
 * TypeScript types for avatar metadata editing (PRD-66).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Field type and category enums
   -------------------------------------------------------------------------- */

export type FieldType = "text" | "number" | "date" | "select" | "multi_select";

export type FieldCategory = "biographical" | "physical" | "preferences" | "production";

/** Human-readable category labels. */
export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  biographical: "Biographical",
  physical: "Physical Attributes",
  preferences: "Preferences",
  production: "Production",
};

/** All categories in display order. */
export const FIELD_CATEGORIES: FieldCategory[] = [
  "biographical",
  "physical",
  "preferences",
  "production",
];

/* --------------------------------------------------------------------------
   Field definitions
   -------------------------------------------------------------------------- */

/** Definition of a single metadata field. */
export interface MetadataFieldDef {
  name: string;
  label: string;
  field_type: FieldType;
  category: FieldCategory;
  is_required: boolean;
  options: string[];
}

/** A field definition paired with its current value. */
export interface MetadataFieldWithValue extends MetadataFieldDef {
  value: unknown;
}

/* --------------------------------------------------------------------------
   Completeness
   -------------------------------------------------------------------------- */

/** Completeness result for a single avatar. */
export interface CompletenessResult {
  avatar_id: number;
  total_required: number;
  filled: number;
  missing_fields: string[];
  percentage: number;
}

/** Project-level completeness summary. */
export interface ProjectCompleteness {
  total_avatars: number;
  complete_avatars: number;
  per_avatar: CompletenessResult[];
}

/* --------------------------------------------------------------------------
   Avatar metadata response
   -------------------------------------------------------------------------- */

/** Structured metadata response for a single avatar. */
export interface AvatarMetadataResponse {
  avatar_id: number;
  avatar_name: string;
  fields: MetadataFieldWithValue[];
  completeness: CompletenessResult;
}

/* --------------------------------------------------------------------------
   Update types
   -------------------------------------------------------------------------- */

/** Result of a successful metadata update. */
export interface MetadataUpdateResult {
  status: string;
  avatar_id: number;
  metadata: Record<string, unknown>;
}

/** Result of a validation failure. */
export interface MetadataValidationFailure {
  status: string;
  errors: MetadataFieldError[];
}

/** A single field-level validation error. */
export interface MetadataFieldError {
  field: string;
  message: string;
}

/* --------------------------------------------------------------------------
   CSV import preview
   -------------------------------------------------------------------------- */

/** Diff entry showing what would change on CSV import. */
export interface CsvDiffEntry {
  avatar_id: number;
  avatar_name: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
}

/** Per-record validation errors from CSV import. */
export interface CsvRecordError {
  row_index: number;
  avatar_id: number | null;
  errors: MetadataFieldError[];
}

/** CSV import preview response. */
export interface CsvImportPreview {
  total_records: number;
  matched_records: number;
  unmatched_records: number;
  diffs: CsvDiffEntry[];
  validation_errors: CsvRecordError[];
}
