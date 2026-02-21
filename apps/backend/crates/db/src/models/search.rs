//! Search & discovery models and DTOs (PRD-20).
//!
//! Contains types for unified search results, saved searches, search analytics,
//! and request/response DTOs used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Unified search result (assembled from multiple entity queries)
// ---------------------------------------------------------------------------

/// A single result row from a full-text search query against any entity table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SearchResultRow {
    pub entity_type: String,
    pub entity_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub rank: f32,
    pub headline: Option<String>,
}

/// Assembled search response returned from the unified search endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct SearchResponse {
    pub total_count: i64,
    pub results: Vec<SearchResultRow>,
    pub facets: SearchFacets,
    pub query_duration_ms: i64,
}

// ---------------------------------------------------------------------------
// Faceted aggregation
// ---------------------------------------------------------------------------

/// Aggregated facet counts for the current search context.
#[derive(Debug, Clone, Serialize, Default)]
pub struct SearchFacets {
    pub entity_types: Vec<FacetValue>,
    pub projects: Vec<FacetValue>,
    pub statuses: Vec<FacetValue>,
    pub tags: Vec<FacetValue>,
}

/// A single facet bucket: value + count.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FacetValue {
    pub value: String,
    pub count: i64,
}

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------

/// A lightweight typeahead result for search-as-you-type.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TypeaheadResult {
    pub entity_type: String,
    pub entity_id: DbId,
    pub name: String,
    pub rank: f32,
}

// ---------------------------------------------------------------------------
// Visual similarity
// ---------------------------------------------------------------------------

/// A visual similarity search result from pgvector.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SimilarityResult {
    pub entity_type: String,
    pub entity_id: DbId,
    pub entity_name: String,
    pub similarity_score: f64,
    pub image_path: Option<String>,
}

/// Request body for visual similarity search.
#[derive(Debug, Clone, Deserialize)]
pub struct SimilarityRequest {
    pub embedding: Vec<f32>,
    pub threshold: Option<f64>,
    pub limit: Option<i64>,
}

// ---------------------------------------------------------------------------
// Saved searches
// ---------------------------------------------------------------------------

/// A row from the `saved_searches` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SavedSearch {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub query_text: Option<String>,
    pub filters: serde_json::Value,
    pub entity_types: Vec<String>,
    pub is_shared: bool,
    pub owner_id: Option<DbId>,
    pub use_count: i32,
    pub last_used_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new saved search.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSavedSearch {
    pub name: String,
    pub description: Option<String>,
    pub query_text: Option<String>,
    pub filters: Option<serde_json::Value>,
    pub entity_types: Option<Vec<String>>,
    pub is_shared: Option<bool>,
}

/// DTO for updating an existing saved search.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSavedSearch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub query_text: Option<String>,
    pub filters: Option<serde_json::Value>,
    pub entity_types: Option<Vec<String>>,
    pub is_shared: Option<bool>,
}

// ---------------------------------------------------------------------------
// Search analytics
// ---------------------------------------------------------------------------

/// A row from the `search_queries` analytics table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SearchQueryLog {
    pub id: DbId,
    pub query_text: String,
    pub filters: serde_json::Value,
    pub result_count: i32,
    pub duration_ms: i32,
    pub user_id: Option<DbId>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Unified search request (deserialized from query params)
// ---------------------------------------------------------------------------

/// Query parameters for the unified search endpoint.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct SearchParams {
    /// Free-text search query.
    pub q: Option<String>,
    /// Comma-separated list of entity types to include.
    pub entity_types: Option<String>,
    /// Filter to a specific project.
    pub project_id: Option<DbId>,
    /// Filter by status name.
    pub status: Option<String>,
    /// Filter by tags (comma-separated).
    pub tags: Option<String>,
    /// Max results per page.
    pub limit: Option<i64>,
    /// Offset for pagination.
    pub offset: Option<i64>,
}

/// Query parameters for the typeahead endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct TypeaheadParams {
    /// Prefix text to match.
    pub q: String,
    /// Max suggestions.
    pub limit: Option<i64>,
}
