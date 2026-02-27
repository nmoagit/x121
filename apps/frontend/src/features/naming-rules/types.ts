/**
 * Types for Dynamic Naming Engine admin UI (PRD-116).
 */

/* --------------------------------------------------------------------------
   API response types
   -------------------------------------------------------------------------- */

export interface NamingCategory {
  id: number;
  name: string;
  description: string;
  example_output: string | null;
}

export interface NamingRule {
  id: number;
  category_id: number;
  project_id: number | null;
  template: string;
  description: string | null;
  is_active: boolean;
  changelog: ChangelogEntry[];
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface TokenInfo {
  name: string;
  description: string;
}

export interface ChangelogEntry {
  old_template: string;
  old_description: string | null;
  changed_at: string;
  changed_by: number | null;
}

export interface PreviewResult {
  filename: string;
  unresolved_tokens: string[];
  validation: ValidationResult | null;
}

export interface ValidationResult {
  valid: boolean;
  tokens_found: string[];
  unknown_tokens: string[];
  missing_tokens: string[];
  warnings: string[];
}

/* --------------------------------------------------------------------------
   Mutation payloads
   -------------------------------------------------------------------------- */

export interface CreateNamingRule {
  category_id: number;
  project_id?: number | null;
  template: string;
  description?: string;
}

export interface UpdateNamingRule {
  template?: string;
  description?: string;
  is_active?: boolean;
}

/* --------------------------------------------------------------------------
   UI constants
   -------------------------------------------------------------------------- */

export interface CategoryGroupDef {
  label: string;
  categories: readonly string[];
}

export const CATEGORY_GROUPS: CategoryGroupDef[] = [
  { label: "Generation", categories: ["scene_video", "thumbnail", "test_shot", "chunk_artifact"] },
  { label: "Storage", categories: ["image_variant", "scene_video_import"] },
  { label: "Export", categories: ["metadata_export"] },
  { label: "Delivery", categories: ["delivery_zip", "delivery_folder", "delivery_video", "delivery_image", "delivery_metadata"] },
];
