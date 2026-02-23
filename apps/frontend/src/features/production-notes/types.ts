/**
 * Production Notes & Internal Comments types (PRD-95).
 */

/* --------------------------------------------------------------------------
   Visibility & entity type unions
   -------------------------------------------------------------------------- */

/** Allowed visibility levels for a production note. */
export type NoteVisibility =
  | "private"
  | "team"
  | "admin_only"
  | "creator_only"
  | "reviewer_only";

/** Entity types that notes can be attached to. */
export type NoteEntityType =
  | "project"
  | "character"
  | "scene"
  | "segment"
  | "scene_type"
  | "workflow";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A note category record from the server. */
export interface NoteCategory {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

/** A production note record from the server. */
export interface ProductionNote {
  id: number;
  entity_type: NoteEntityType;
  entity_id: number;
  user_id: number;
  content_md: string;
  category_id: number;
  visibility: NoteVisibility;
  pinned: boolean;
  parent_note_id: number | null;
  resolved_at: string | null;
  resolved_by: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a note category. */
export interface CreateNoteCategory {
  name: string;
  color?: string;
  icon?: string;
}

/** Request body for creating a production note. */
export interface CreateProductionNote {
  entity_type: NoteEntityType;
  entity_id: number;
  content_md: string;
  category_id: number;
  visibility?: NoteVisibility;
  parent_note_id?: number | null;
}

/** Request body for updating a production note. */
export interface UpdateProductionNote {
  content_md?: string;
  category_id?: number;
  visibility?: NoteVisibility;
}

/** Query parameters for note search. */
export interface NoteSearchParams {
  q: string;
  entity_type?: NoteEntityType;
}
