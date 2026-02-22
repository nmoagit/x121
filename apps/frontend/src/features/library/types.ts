/**
 * Character library feature types (PRD-60).
 */

/** A library character record from the server. */
export interface LibraryCharacter {
  id: number;
  name: string;
  source_character_id: number | null;
  source_project_id: number | null;
  master_metadata: Record<string, unknown>;
  tags: string[];
  description: string | null;
  thumbnail_path: string | null;
  is_published: boolean;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/** Create payload for a new library character. */
export interface CreateLibraryCharacter {
  name: string;
  source_character_id?: number | null;
  source_project_id?: number | null;
  master_metadata?: Record<string, unknown>;
  tags?: string[];
  description?: string | null;
  thumbnail_path?: string | null;
  is_published?: boolean;
}

/** Update payload for an existing library character (all fields optional). */
export interface UpdateLibraryCharacter {
  name?: string;
  master_metadata?: Record<string, unknown>;
  tags?: string[];
  description?: string | null;
  thumbnail_path?: string | null;
  is_published?: boolean;
}

/** A link between a library character and a project character. */
export interface ProjectCharacterLink {
  id: number;
  project_id: number;
  library_character_id: number;
  project_character_id: number;
  linked_fields: string[];
  imported_at: string;
  created_at: string;
  updated_at: string;
}

/** Request body for importing a library character into a project. */
export interface ImportCharacterRequest {
  project_id: number;
  linked_fields?: string[];
}

/** Cross-project usage entry for a library character. */
export interface LibraryUsageEntry {
  link_id: number;
  project_id: number;
  project_name: string;
  project_character_id: number;
  character_name: string;
  imported_at: string;
}

/** Per-field synchronisation status between library and project character. */
export interface FieldSyncStatus {
  field: string;
  status: "in_sync" | "diverged" | "library_only" | "project_only";
  library_value: unknown | null;
  project_value: unknown | null;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Maximum number of linked fields per link. */
export const MAX_LINKED_FIELDS = 50;

/** System fields that cannot be linked. */
export const NON_LINKABLE_FIELDS = [
  "id",
  "project_id",
  "created_at",
  "updated_at",
  "deleted_at",
  "status_id",
  "embedding_status_id",
  "embedding_extracted_at",
  "face_detection_confidence",
  "face_bounding_box",
] as const;
