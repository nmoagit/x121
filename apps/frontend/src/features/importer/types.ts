/**
 * TypeScript types for the folder-to-entity bulk importer (PRD-016).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Import session
   -------------------------------------------------------------------------- */

export interface ImportSession {
  id: number;
  status_id: number;
  project_id: number;
  staging_path: string;
  source_name: string;
  total_files: number;
  total_size_bytes: number;
  mapped_entities: number;
  validation_report_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Import mapping entry
   -------------------------------------------------------------------------- */

export interface ImportMappingEntry {
  id: number;
  session_id: number;
  source_path: string;
  file_name: string;
  file_size_bytes: number;
  file_extension: string;
  derived_entity_type: string;
  derived_entity_name: string;
  derived_category: string | null;
  target_entity_id: number | null;
  action: ImportAction;
  conflict_details: Record<string, unknown> | null;
  validation_errors: unknown[];
  validation_warnings: unknown[];
  is_selected: boolean;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Preview & commit
   -------------------------------------------------------------------------- */

export interface UniquenessConflict {
  entity_name: string;
  paths: string[];
  suggested_action: "Merge" | "RenameWithPath" | "Skip";
}

export interface FolderImportPreview {
  session_id: number;
  total_files: number;
  total_size_bytes: number;
  entities_to_create: number;
  entities_to_update: number;
  uniqueness_conflicts: UniquenessConflict[];
  entries: ImportMappingEntry[];
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface UploadResponse {
  session_id: number;
  staging_path: string;
  files_received: number;
}

/* --------------------------------------------------------------------------
   Action types & helpers
   -------------------------------------------------------------------------- */

export type ImportAction = "create" | "update" | "skip" | "conflict";

/** Human-readable labels for import actions. */
export const ACTION_LABELS: Record<ImportAction, string> = {
  create: "Create",
  update: "Update",
  skip: "Skip",
  conflict: "Conflict",
};

/** Color variants for import actions (maps to Badge variant names). */
export const ACTION_VARIANTS: Record<ImportAction, string> = {
  create: "success",
  update: "info",
  skip: "default",
  conflict: "warning",
};

/* --------------------------------------------------------------------------
   Entity type helpers
   -------------------------------------------------------------------------- */

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  image: "Image",
  metadata: "Metadata",
  video: "Video",
  unknown: "Unknown",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}
