/**
 * Prompt Editor & Versioning types (PRD-63).
 */

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Regex matching `{placeholder}` tokens in prompt templates.
 *  Sync: mirrors `PLACEHOLDER_PATTERN` in `core/src/prompt_editor.rs`. */
export const PLACEHOLDER_REGEX = /\{[a-zA-Z_][a-zA-Z0-9_.]*\}/g;

/** Maximum allowed prompt length in characters.
 *  Sync: mirrors `MAX_PROMPT_LENGTH` in `core/src/provenance.rs`. */
export const MAX_PROMPT_LENGTH = 10_000;

/** Maximum allowed negative prompt length in characters.
 *  Sync: mirrors `MAX_NEGATIVE_PROMPT_LENGTH` in `core/src/prompt_editor.rs`. */
export const MAX_NEGATIVE_PROMPT_LENGTH = 5_000;

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A prompt version record from the server. */
export interface PromptVersion {
  id: number;
  scene_type_id: number;
  version: number;
  positive_prompt: string;
  negative_prompt: string | null;
  change_notes: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

/** A prompt library entry record from the server. */
export interface PromptLibraryEntry {
  id: number;
  name: string;
  description: string | null;
  positive_prompt: string;
  negative_prompt: string | null;
  tags: string[] | null;
  model_compatibility: string[] | null;
  usage_count: number;
  avg_rating: number | null;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

/** Diff summary between two prompt versions. */
export interface PromptDiff {
  positive_changed: boolean;
  negative_changed: boolean;
  positive_additions: number;
  positive_removals: number;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for saving a new prompt version. */
export interface CreatePromptVersionRequest {
  scene_type_id: number;
  positive_prompt: string;
  negative_prompt?: string | null;
  change_notes?: string | null;
}

/** Request body for creating a prompt library entry. */
export interface CreateLibraryEntryRequest {
  name: string;
  description?: string | null;
  positive_prompt: string;
  negative_prompt?: string | null;
  tags?: string[] | null;
  model_compatibility?: string[] | null;
}

/** Request body for updating a prompt library entry. */
export interface UpdateLibraryEntryRequest {
  name?: string | null;
  description?: string | null;
  positive_prompt?: string | null;
  negative_prompt?: string | null;
  tags?: string[] | null;
  model_compatibility?: string[] | null;
}
