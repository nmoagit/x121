//! Handlers for per-character scene overrides (PRD-111).
//!
//! Routes nested under `/characters/{character_id}/scene-settings`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character_scene_override::{
    BulkCharacterSceneOverrides, CharacterSceneOverrideUpdate,
};
use x121_db::repositories::{CharacterRepo, CharacterSceneOverrideRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/characters/{character_id}/scene-settings
///
/// List effective scene settings for a character (three-level merge).
/// The character's `project_id` is resolved automatically.
pub async fn list_effective(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Look up the character to get its project_id
    let character = CharacterRepo::find_by_id(&state.pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;

    let settings =
        CharacterSceneOverrideRepo::list_effective(&state.pool, character_id, character.project_id)
            .await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/characters/{character_id}/scene-settings
///
/// Bulk upsert character scene overrides.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(body): Json<BulkCharacterSceneOverrides>,
) -> AppResult<impl IntoResponse> {
    let results =
        CharacterSceneOverrideRepo::bulk_upsert(&state.pool, character_id, &body.overrides).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/characters/{character_id}/scene-settings/{scene_catalog_id}
///
/// Toggle a single scene override for a character.
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((character_id, scene_catalog_id)): Path<(DbId, DbId)>,
    Json(body): Json<CharacterSceneOverrideUpdate>,
) -> AppResult<impl IntoResponse> {
    let setting = CharacterSceneOverrideRepo::upsert(
        &state.pool,
        character_id,
        scene_catalog_id,
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// DELETE /api/v1/characters/{character_id}/scene-settings/{scene_catalog_id}
///
/// Remove a character scene override (reverts to project/catalog default).
pub async fn remove_override(
    State(state): State<AppState>,
    Path((character_id, scene_catalog_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let removed =
        CharacterSceneOverrideRepo::delete(&state.pool, character_id, scene_catalog_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterSceneOverride",
            id: scene_catalog_id,
        }))
    }
}
