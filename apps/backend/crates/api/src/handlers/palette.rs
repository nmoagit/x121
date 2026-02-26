//! Handlers for command palette and recent items (PRD-31).
//!
//! Provides endpoints for palette search, recording entity access, listing
//! recent items, and clearing recent items. All endpoints require authentication.

use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;

use x121_core::command_palette;
use x121_db::models::recent_item::{PaletteSearchParams, RecordAccessRequest};
use x121_db::repositories::RecentItemRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /search/palette?q=...
// ---------------------------------------------------------------------------

/// Search the command palette for matching entities and commands.
///
/// Currently returns an empty list; full-text search integration will be
/// added when the search engine supports palette-specific queries.
pub async fn palette_search(
    _auth: AuthUser,
    Query(params): Query<PaletteSearchParams>,
) -> AppResult<impl IntoResponse> {
    let _query = params.q.unwrap_or_default();
    // Placeholder: return empty results until search infrastructure integration.
    let results: Vec<serde_json::Value> = Vec::new();

    tracing::debug!("Palette search executed");

    Ok(Json(DataResponse { data: results }))
}

// ---------------------------------------------------------------------------
// GET /user/recent-items?limit=N
// ---------------------------------------------------------------------------

/// List recent items for the authenticated user, ordered by last access time.
pub async fn get_recent_items(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PaletteSearchParams>,
) -> AppResult<impl IntoResponse> {
    let limit = command_palette::validate_recent_limit(
        params
            .limit
            .unwrap_or(command_palette::DEFAULT_RECENT_LIMIT),
    );

    let items = RecentItemRepo::get_recent(&state.pool, auth.user_id, limit).await?;

    tracing::debug!(
        user_id = auth.user_id,
        count = items.len(),
        "Fetched recent items"
    );

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// POST /user/recent-items
// ---------------------------------------------------------------------------

/// Record an entity access for the authenticated user.
///
/// If the entity was already accessed, increments the access count and
/// updates `last_accessed_at`.
pub async fn record_access(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<RecordAccessRequest>,
) -> AppResult<impl IntoResponse> {
    command_palette::validate_entity_type(&input.entity_type)?;

    let item = RecentItemRepo::record_access(
        &state.pool,
        auth.user_id,
        &input.entity_type,
        input.entity_id,
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        entity_type = %input.entity_type,
        entity_id = input.entity_id,
        "Recorded entity access"
    );

    Ok(Json(DataResponse { data: item }))
}

// ---------------------------------------------------------------------------
// DELETE /user/recent-items
// ---------------------------------------------------------------------------

/// Clear all recent items for the authenticated user.
pub async fn clear_recent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let deleted = RecentItemRepo::clear_all(&state.pool, auth.user_id).await?;

    tracing::info!(user_id = auth.user_id, deleted, "Cleared recent items");

    Ok(Json(DataResponse { data: deleted }))
}
