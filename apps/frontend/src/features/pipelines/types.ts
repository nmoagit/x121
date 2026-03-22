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

/** Pipeline entity as returned by the API. */
export interface Pipeline {
  id: number;
  code: string;
  name: string;
  description: string | null;
  seed_slots: SeedSlot[];
  naming_rules: Record<string, unknown>;
  delivery_config: Record<string, unknown>;
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
}

/** Payload for updating an existing pipeline. */
export interface UpdatePipeline {
  name?: string;
  description?: string;
  seed_slots?: SeedSlot[];
  naming_rules?: Record<string, unknown>;
  delivery_config?: Record<string, unknown>;
  is_active?: boolean;
}
