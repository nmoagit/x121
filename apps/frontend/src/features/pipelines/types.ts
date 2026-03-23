/**
 * TypeScript types for multi-pipeline architecture (PRD-138).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Pipeline
   -------------------------------------------------------------------------- */

/** A seed slot definition within a pipeline configuration. */
export interface SeedSlot {
  name: string;
  required: boolean;
  description: string;
}

/* --------------------------------------------------------------------------
   Import Rules
   -------------------------------------------------------------------------- */

/** Pattern for matching seed image files during import. */
export interface SeedImportPattern {
  slot: string;
  pattern: string;
  extensions: string[];
}

/** Pattern for matching video files during import. */
export interface VideoImportPattern {
  pattern: string;
  extensions: string[];
}

/** Pattern for matching metadata files during import. */
export interface MetadataImportPattern {
  type: string;
  pattern: string;
}

/** Import rules configuration for file classification during import. */
export interface ImportRules {
  seed_patterns: SeedImportPattern[];
  video_patterns: VideoImportPattern[];
  metadata_patterns: MetadataImportPattern[];
  case_sensitive: boolean;
}

/** Pipeline entity as returned by the API. */
export interface Pipeline {
  id: number;
  code: string;
  name: string;
  description: string | null;
  seed_slots: SeedSlot[];
  naming_rules: Record<string, unknown>;
  delivery_config: Record<string, unknown>;
  import_rules: ImportRules | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a new pipeline. */
export interface CreatePipeline {
  code: string;
  name: string;
  description?: string;
  seed_slots?: SeedSlot[];
  naming_rules?: Record<string, unknown>;
  delivery_config?: Record<string, unknown>;
  import_rules?: ImportRules;
}

/** Payload for updating an existing pipeline. */
export interface UpdatePipeline {
  name?: string;
  description?: string;
  seed_slots?: SeedSlot[];
  naming_rules?: Record<string, unknown>;
  delivery_config?: Record<string, unknown>;
  import_rules?: ImportRules;
  is_active?: boolean;
}
