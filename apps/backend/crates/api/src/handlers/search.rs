//! Handlers for search & discovery (PRD-20).
//!
//! Provides unified full-text search, typeahead, visual similarity search,
//! and saved search CRUD. All endpoints require authentication.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::search::{
    CreateSavedSearch, SearchParams, SearchResponse, SimilarityRequest, TypeaheadParams,
};
use trulience_db::repositories::SearchRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Shared search execution helper
// ---------------------------------------------------------------------------

/// Execute a full-text search with facets and timing.
///
/// Used by both `unified_search` and `execute_saved_search` to avoid
/// duplicating the search+facets+timing+response assembly logic.
async fn run_search(
    pool: &sqlx::PgPool,
    params: &SearchParams,
) -> Result<SearchResponse, sqlx::Error> {
    let start = std::time::Instant::now();

    let results = SearchRepo::search_fulltext(pool, params).await?;
    let facets = SearchRepo::compute_facets(pool, params).await?;

    let duration_ms = start.elapsed().as_millis() as i64;
    let total_count = results.len() as i64;

    Ok(SearchResponse {
        total_count,
        results,
        facets,
        query_duration_ms: duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Unified search
// ---------------------------------------------------------------------------

/// GET /api/v1/search
///
/// Unified full-text search across characters, projects, and scene types.
/// Returns ranked results, faceted counts, and query timing.
pub async fn unified_search(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> AppResult<impl IntoResponse> {
    let response = run_search(&state.pool, &params).await?;

    // Log analytics (fire-and-forget, do not fail the request on log error)
    let query_text = params.q.as_deref().unwrap_or("");
    let filters = serde_json::to_value(&params).unwrap_or_default();
    let _ = SearchRepo::log_search_query(
        &state.pool,
        query_text,
        &filters,
        response.total_count as i32,
        response.query_duration_ms as i32,
        Some(auth.user_id),
    )
    .await;

    tracing::debug!(
        query = ?params.q,
        results = response.total_count,
        duration_ms = response.query_duration_ms,
        user_id = auth.user_id,
        "Search executed",
    );

    Ok(Json(DataResponse { data: response }))
}

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------

/// GET /api/v1/search/typeahead
///
/// Fast prefix-matching search for search-as-you-type.
pub async fn typeahead(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<TypeaheadParams>,
) -> AppResult<impl IntoResponse> {
    let results = if params.q.len() < 2 {
        Vec::new()
    } else {
        SearchRepo::typeahead(&state.pool, &params.q, params.limit).await?
    };

    Ok(Json(DataResponse { data: results }))
}

// ---------------------------------------------------------------------------
// Visual similarity
// ---------------------------------------------------------------------------

/// POST /api/v1/search/similar
///
/// Visual similarity search using pgvector embeddings.
/// Accepts an embedding vector and returns similar images.
pub async fn visual_similarity(
    _auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<SimilarityRequest>,
) -> AppResult<impl IntoResponse> {
    if input.embedding.is_empty() {
        return Err(AppError::BadRequest("embedding must not be empty".into()));
    }

    let results = SearchRepo::search_similar(
        &state.pool,
        &input.embedding,
        input.threshold,
        input.limit,
    )
    .await?;

    Ok(Json(DataResponse { data: results }))
}

// ---------------------------------------------------------------------------
// Saved search CRUD
// ---------------------------------------------------------------------------

/// POST /api/v1/search/saved
///
/// Create a new saved search.
pub async fn create_saved_search(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateSavedSearch>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    let filters = input.filters.unwrap_or(serde_json::json!({}));
    let entity_types = input.entity_types.unwrap_or_default();
    let is_shared = input.is_shared.unwrap_or(false);

    let saved = SearchRepo::create_saved_search(
        &state.pool,
        input.name.trim(),
        input.description.as_deref(),
        input.query_text.as_deref(),
        &filters,
        &entity_types,
        Some(auth.user_id),
        is_shared,
    )
    .await?;

    tracing::info!(
        saved_search_id = saved.id,
        user_id = auth.user_id,
        "Saved search created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: saved })))
}

/// GET /api/v1/search/saved
///
/// List saved searches (user's own + shared).
pub async fn list_saved_searches(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let searches = SearchRepo::list_saved_searches(&state.pool, Some(auth.user_id)).await?;

    Ok(Json(DataResponse { data: searches }))
}

/// DELETE /api/v1/search/saved/{id}
///
/// Delete a saved search by ID.
pub async fn delete_saved_search(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = SearchRepo::delete_saved_search(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "SavedSearch",
            id,
        }));
    }

    tracing::info!(
        saved_search_id = id,
        user_id = auth.user_id,
        "Saved search deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/search/saved/{id}/execute
///
/// Execute a saved search by loading its query/filters and running the search.
pub async fn execute_saved_search(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let saved = SearchRepo::find_saved_search_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SavedSearch",
            id,
        }))?;

    // Record usage
    let _ = SearchRepo::record_saved_search_use(&state.pool, id).await;

    // Build search params from saved search
    let entity_types_str = if saved.entity_types.is_empty() {
        None
    } else {
        Some(saved.entity_types.join(","))
    };

    let params = SearchParams {
        q: saved.query_text.clone(),
        entity_types: entity_types_str,
        project_id: saved.filters.get("project_id").and_then(|v| v.as_i64()),
        status: saved
            .filters
            .get("status")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        tags: saved
            .filters
            .get("tags")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        limit: None,
        offset: None,
    };

    let response = run_search(&state.pool, &params).await?;

    tracing::debug!(
        saved_search_id = id,
        results = response.total_count,
        duration_ms = response.query_duration_ms,
        user_id = auth.user_id,
        "Saved search executed",
    );

    Ok(Json(DataResponse { data: response }))
}
