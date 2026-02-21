/**
 * TypeScript types for search & discovery engine (PRD-20).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Search result types
   -------------------------------------------------------------------------- */

export interface SearchResultRow {
  entity_type: string;
  entity_id: number;
  name: string;
  description: string | null;
  rank: number;
  headline: string | null;
}

export interface SearchFacets {
  entity_types: FacetValue[];
  projects: FacetValue[];
  statuses: FacetValue[];
  tags: FacetValue[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SearchResponse {
  total_count: number;
  results: SearchResultRow[];
  facets: SearchFacets;
  query_duration_ms: number;
}

/* --------------------------------------------------------------------------
   Typeahead
   -------------------------------------------------------------------------- */

export interface TypeaheadResult {
  entity_type: string;
  entity_id: number;
  name: string;
  rank: number;
}

/* --------------------------------------------------------------------------
   Visual similarity
   -------------------------------------------------------------------------- */

export interface SimilarityResult {
  entity_type: string;
  entity_id: number;
  entity_name: string;
  similarity_score: number;
  image_path: string | null;
}

export interface SimilarityRequest {
  embedding: number[];
  threshold?: number;
  limit?: number;
}

/* --------------------------------------------------------------------------
   Saved searches
   -------------------------------------------------------------------------- */

export interface SavedSearch {
  id: number;
  name: string;
  description: string | null;
  query_text: string | null;
  filters: Record<string, unknown>;
  entity_types: string[];
  is_shared: boolean;
  owner_id: number | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedSearch {
  name: string;
  description?: string;
  query_text?: string;
  filters?: Record<string, unknown>;
  entity_types?: string[];
  is_shared?: boolean;
}

/* --------------------------------------------------------------------------
   Search query parameters
   -------------------------------------------------------------------------- */

export interface SearchParams {
  q?: string;
  entity_types?: string;
  project_id?: number;
  status?: string;
  tags?: string;
  limit?: number;
  offset?: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Searchable entity types. */
export const ENTITY_TYPES = ["character", "project", "scene_type"] as const;

/** Human-readable labels for entity types. */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  character: "Character",
  project: "Project",
  scene_type: "Scene Type",
};

/** Get a human-readable label for an entity type. */
export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}
