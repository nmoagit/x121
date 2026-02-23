/**
 * Bulk Data Maintenance types (PRD-18).
 */

/* --------------------------------------------------------------------------
   Status and type unions
   -------------------------------------------------------------------------- */

/** Status values for a bulk operation. */
export type BulkOperationStatus =
  | "preview"
  | "executing"
  | "completed"
  | "failed"
  | "undone";

/** Type values for a bulk operation. */
export type BulkOperationType = "find_replace" | "repath" | "batch_update";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A bulk operation record from the server. */
export interface BulkOperation {
  id: number;
  operation_type_id: number;
  status_id: number;
  parameters: Record<string, unknown>;
  scope_project_id: number | null;
  affected_entity_type: string | null;
  affected_field: string | null;
  preview_count: number;
  affected_count: number;
  undo_data: unknown;
  error_message: string | null;
  executed_by: number | null;
  executed_at: string | null;
  undone_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Info about a searchable field included in a preview. */
export interface FieldInfo {
  entity_type: string;
  table_name: string;
  column_name: string;
}

/** Response for a find/replace or re-path preview. */
export interface PreviewResponse {
  operation_id: number;
  total_matches: number;
  searchable_fields: FieldInfo[];
}

/** Response for an execute or undo action. */
export interface ExecutionResponse {
  operation_id: number;
  affected_count: number;
  status: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for find/replace preview. */
export interface FindReplaceRequest {
  search_term: string;
  replace_with: string;
  use_regex?: boolean;
  entity_type?: string;
  field_name?: string;
  project_id?: number;
  case_sensitive?: boolean;
}

/** Request body for re-path preview. */
export interface RepathRequest {
  old_prefix: string;
  new_prefix: string;
  entity_type?: string;
  project_id?: number;
  validate_new_paths?: boolean;
}

/* --------------------------------------------------------------------------
   Query parameter types
   -------------------------------------------------------------------------- */

/** Query parameters for listing operations. */
export interface OperationListParams {
  limit?: number;
  offset?: number;
  operation_type?: BulkOperationType;
  status?: BulkOperationStatus;
}
