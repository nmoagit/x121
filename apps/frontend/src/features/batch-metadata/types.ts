/**
 * Batch Metadata Operations types (PRD-88).
 */

/* --------------------------------------------------------------------------
   Operation type union
   -------------------------------------------------------------------------- */

/** Types of batch metadata operations. */
export type BatchOperationType =
  | "multi_select_edit"
  | "search_replace"
  | "csv_import"
  | "field_operation";

/** Lifecycle statuses for batch metadata operations. */
export type BatchOperationStatus =
  | "preview"
  | "applying"
  | "completed"
  | "undone"
  | "failed";

/** Field-level operation types. */
export type FieldOperationType =
  | "clear"
  | "set_default"
  | "copy_field"
  | "concatenate";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A batch metadata operation record from the server. */
export interface BatchMetadataOperation {
  id: number;
  status_id: number;
  operation_type: BatchOperationType;
  project_id: number;
  character_ids: number[];
  character_count: number;
  parameters: Record<string, unknown>;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  summary: string;
  initiated_by: number | null;
  applied_at: string | null;
  undone_at: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a batch metadata preview. */
export interface CreateBatchMetadataRequest {
  operation_type: BatchOperationType;
  project_id: number;
  character_ids: number[];
  parameters?: Record<string, unknown>;
  field_name?: string;
}

/** Search/replace parameters embedded in the operation. */
export interface SearchReplaceParams {
  search_pattern: string;
  replace_with: string;
  use_regex: boolean;
  field_name?: string;
  case_sensitive: boolean;
}

/** Field operation parameters. */
export interface FieldOperationParams {
  field_operation_type: FieldOperationType;
  field_name: string;
  default_value?: string;
  source_field?: string;
  separator?: string;
}

/** Query parameters for listing operations. */
export interface ListBatchMetadataParams {
  project_id?: number;
  operation_type?: BatchOperationType;
  status?: BatchOperationStatus;
  limit?: number;
  offset?: number;
}
