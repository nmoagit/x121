//! Handlers for undo/redo tree persistence (PRD-51).
//!
//! Provides GET/PUT/DELETE endpoints for per-user per-entity undo trees.
//! All endpoints require authentication.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;

use x121_core::undo::{validate_entity_type, validate_tree_json};
use x121_db::models::undo_tree::SaveUndoTree;
use x121_db::repositories::UndoTreeRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Per-entity undo tree endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/undo-tree/{entity_type}/{entity_id}
///
/// Returns the undo tree for a specific entity, or null if none exists.
pub async fn get_tree(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;

    let tree = UndoTreeRepo::get_tree(&state.pool, auth.user_id, &entity_type, entity_id).await?;
    Ok(Json(DataResponse { data: tree }))
}

/// PUT /api/v1/user/undo-tree/{entity_type}/{entity_id}
///
/// Saves (upserts) an undo tree for a specific entity.
/// Validates entity type and tree_json structure.
pub async fn save_tree(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
    Json(input): Json<SaveUndoTree>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;
    validate_tree_json(&input.tree_json)?;

    let tree =
        UndoTreeRepo::save_tree(&state.pool, auth.user_id, &entity_type, entity_id, &input).await?;

    tracing::debug!(
        user_id = auth.user_id,
        entity_type = entity_type.as_str(),
        entity_id,
        "Undo tree saved"
    );

    Ok(Json(DataResponse { data: tree }))
}

/// DELETE /api/v1/user/undo-tree/{entity_type}/{entity_id}
///
/// Deletes an undo tree for a specific entity.
pub async fn delete_tree(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, i64)>,
) -> AppResult<impl IntoResponse> {
    validate_entity_type(&entity_type)?;

    UndoTreeRepo::delete_tree(&state.pool, auth.user_id, &entity_type, entity_id).await?;

    tracing::debug!(
        user_id = auth.user_id,
        entity_type = entity_type.as_str(),
        entity_id,
        "Undo tree deleted"
    );

    Ok(axum::http::StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// User-level undo tree listing
// ---------------------------------------------------------------------------

/// GET /api/v1/user/undo-trees
///
/// Lists all undo trees for the authenticated user.
pub async fn list_trees(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let trees = UndoTreeRepo::list_trees_for_user(&state.pool, auth.user_id).await?;
    Ok(Json(DataResponse { data: trees }))
}
