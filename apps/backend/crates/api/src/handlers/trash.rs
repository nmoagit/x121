//! Handlers for the `/trash` resource.
//!
//! Provides a unified trash / bin API that spans all soft-deletable entity
//! types: listing trashed items, restoring them, previewing a purge, and
//! hard-deleting (purging) individual or all trashed records.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::repositories::trash_repo::{
    is_known_entity_type, PurgePreview, TrashRepo, TrashSummary,
};
use x121_db::repositories::{
    CharacterRepo, DerivedImageRepo, ImageVariantRepo, ProjectRepo, SceneRepo, SceneTypeRepo,
    SceneVideoVersionRepo, SegmentRepo, SourceImageRepo,
};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Query parameters for the trash listing endpoint.
#[derive(Debug, Deserialize)]
pub struct TrashQuery {
    /// Optional entity type filter (e.g. "projects", "characters").
    #[serde(rename = "type")]
    pub entity_type: Option<String>,
}

/// GET /api/v1/trash
///
/// List all soft-deleted items, optionally filtered by entity type.
pub async fn list_trashed(
    State(state): State<AppState>,
    Query(params): Query<TrashQuery>,
) -> AppResult<Json<TrashSummary>> {
    if let Some(ref et) = params.entity_type {
        validate_entity_type(et)?;
    }
    let summary = TrashRepo::list_trashed(&state.pool, params.entity_type.as_deref()).await?;
    Ok(Json(summary))
}

/// POST /api/v1/trash/{entity_type}/{id}/restore
///
/// Restore a soft-deleted entity. Returns 409 if the parent entity is also
/// trashed (must restore parent first). Returns 404 if the entity is not
/// in the trash.
pub async fn restore(
    State(state): State<AppState>,
    Path((entity_type, id)): Path<(String, DbId)>,
) -> AppResult<Json<serde_json::Value>> {
    validate_entity_type(&entity_type)?;

    // Check whether the parent is trashed; if so, block the restore.
    if let Some(msg) = TrashRepo::check_parent_trashed(&state.pool, &entity_type, id).await? {
        return Err(AppError::Core(CoreError::Conflict(msg)));
    }

    // Dispatch to the entity-specific restore method.
    let restored = dispatch_restore(&state.pool, &entity_type, id).await?;

    if restored {
        Ok(Json(serde_json::json!({
            "restored": true,
            "entity_type": entity_type,
            "id": id,
        })))
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "TrashedItem",
            id,
        }))
    }
}

/// DELETE /api/v1/trash/purge
///
/// Hard-delete all soft-deleted records across every entity table.
pub async fn purge_all(State(state): State<AppState>) -> AppResult<StatusCode> {
    TrashRepo::purge_all(&state.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/trash/{entity_type}/{id}/purge
///
/// Hard-delete a single soft-deleted record.
pub async fn purge_one(
    State(state): State<AppState>,
    Path((entity_type, id)): Path<(String, DbId)>,
) -> AppResult<StatusCode> {
    validate_entity_type(&entity_type)?;
    let deleted = TrashRepo::purge_one(&state.pool, &entity_type, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "TrashedItem",
            id,
        }))
    }
}

/// GET /api/v1/trash/purge-preview
///
/// Preview how many rows would be removed by a purge-all, broken down by
/// entity type, with an estimated byte count from file-bearing tables.
pub async fn purge_preview(State(state): State<AppState>) -> AppResult<Json<PurgePreview>> {
    let preview = TrashRepo::purge_preview(&state.pool).await?;
    Ok(Json(preview))
}

// ── Private helpers ──────────────────────────────────────────────────────

/// Validate that `entity_type` is one of the known soft-deletable types.
fn validate_entity_type(entity_type: &str) -> AppResult<()> {
    if is_known_entity_type(entity_type) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "Unknown entity type: {entity_type}"
        )))
    }
}

/// Dispatch a restore call to the correct entity repository.
///
/// Returns `true` if a row was restored, `false` if the entity was not
/// found in the trash (already live or does not exist).
async fn dispatch_restore(
    pool: &sqlx::PgPool,
    entity_type: &str,
    id: DbId,
) -> Result<bool, sqlx::Error> {
    match entity_type {
        "projects" => ProjectRepo::restore(pool, id).await,
        "characters" => CharacterRepo::restore(pool, id).await,
        "scenes" => SceneRepo::restore(pool, id).await,
        "segments" => SegmentRepo::restore(pool, id).await,
        "source_images" => SourceImageRepo::restore(pool, id).await,
        "derived_images" => DerivedImageRepo::restore(pool, id).await,
        "image_variants" => ImageVariantRepo::restore(pool, id).await,
        "scene_types" => SceneTypeRepo::restore(pool, id).await,
        "scene_video_versions" => SceneVideoVersionRepo::restore(pool, id).await,
        // validate_entity_type is called before dispatch, so this is unreachable
        _ => Ok(false),
    }
}
