/**
 * Avatar library feature types (PRD-60).
 */

/** A library avatar record from the server (cross-project browser view). */
export interface LibraryAvatar {
  id: number;
  name: string;
  project_id: number;
  project_name: string;
  group_name: string | null;
  hero_variant_id: number | null;
  scene_count: number;
  image_count: number;
  clip_count: number;
  has_metadata: boolean;
  status_id: number;
  is_enabled: boolean;
  created_at: string;
}

/** Create payload for a new library avatar. */
export interface CreateLibraryAvatar {
  name: string;
  source_avatar_id?: number | null;
  source_project_id?: number | null;
  master_metadata?: Record<string, unknown>;
  tags?: string[];
  description?: string | null;
  thumbnail_path?: string | null;
  is_published?: boolean;
}

/** Update payload for an existing library avatar (all fields optional). */
export interface UpdateLibraryAvatar {
  name?: string;
  master_metadata?: Record<string, unknown>;
  tags?: string[];
  description?: string | null;
  thumbnail_path?: string | null;
  is_published?: boolean;
}

/** A link between a library avatar and a project avatar. */
export interface ProjectAvatarLink {
  id: number;
  project_id: number;
  library_avatar_id: number;
  project_avatar_id: number;
  linked_fields: string[];
  imported_at: string;
  created_at: string;
  updated_at: string;
}

/** Request body for importing a library avatar into a project. */
export interface ImportAvatarRequest {
  project_id: number;
  linked_fields?: string[];
}

/** Cross-project usage entry for a library avatar. */
export interface LibraryUsageEntry {
  link_id: number;
  project_id: number;
  project_name: string;
  project_avatar_id: number;
  avatar_name: string;
  imported_at: string;
}

/** Per-field synchronisation status between library and project avatar. */
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
