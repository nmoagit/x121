/**
 * Legacy Data Import & Migration Toolkit types (PRD-86).
 */

/* --------------------------------------------------------------------------
   Status and action unions
   -------------------------------------------------------------------------- */

/** Status values for a legacy import run. */
export type ImportRunStatus =
  | "scanning"
  | "mapping"
  | "preview"
  | "importing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

/** Actions taken on entities during import. */
export type EntityAction =
  | "created"
  | "updated"
  | "skipped"
  | "failed"
  | "duplicate";

/** Match key for entity matching. */
export type MatchKey = "name" | "id" | "path" | "hash";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A legacy import run record from the server. */
export interface LegacyImportRun {
  id: number;
  status_id: number;
  source_path: string;
  project_id: number;
  mapping_config: Record<string, unknown>;
  match_key: MatchKey;
  total_files: number;
  characters_created: number;
  characters_updated: number;
  scenes_registered: number;
  images_registered: number;
  duplicates_found: number;
  errors: number;
  gap_report: GapReport;
  initiated_by: number | null;
  created_at: string;
  updated_at: string;
}

/** An entity log entry from the server. */
export interface EntityLog {
  id: number;
  run_id: number;
  entity_type: string;
  entity_id: number | null;
  source_path: string;
  action: EntityAction;
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A path mapping rule. */
export interface PathMappingRule {
  pattern: string;
  entity_type: string;
  captures: string[];
}

/** An entity inferred from path scanning. */
export interface InferredEntity {
  source_path: string;
  entity_type: string;
  captured_values: Record<string, string>;
  inferred_name: string;
}

/** Gap report structure. */
export interface GapReport {
  gaps?: GapEntry[];
  summary?: Record<string, number>;
  [key: string]: unknown;
}

/** A single gap entry in the gap report. */
export interface GapEntry {
  gap_type: "missing_metadata" | "missing_source_image" | "missing_scene";
  entity_name: string;
  details: string;
}

/** Action counts in a run report. */
export interface ActionCount {
  action: EntityAction;
  count: number;
}

/** Full run report returned by the report endpoint. */
export interface RunReport {
  run: LegacyImportRun;
  action_counts: ActionCount[];
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating an import run. */
export interface CreateImportRun {
  source_path: string;
  project_id: number;
  mapping_config?: Record<string, unknown>;
  match_key?: MatchKey;
}

/** Request body for scanning a folder. */
export interface ScanFolderRequest {
  run_id: number;
  source_path: string;
}

/** Request body for previewing an import. */
export interface PreviewImportRequest {
  run_id: number;
}

/** Request body for committing an import. */
export interface CommitImportRequest {
  run_id: number;
}

/** Request body for CSV import. */
export interface CsvImportRequest {
  run_id: number;
  csv_data: string;
  column_mapping: Record<string, string>;
}
