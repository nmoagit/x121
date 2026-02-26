//! Handlers for the `/scenes` resource.
//!
//! Scenes are nested under characters:
//! `/characters/{character_id}/scenes[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene::{CreateScene, Scene, UpdateScene};
use x121_db::repositories::SceneRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/characters/{character_id}/scenes
///
/// Overrides `input.character_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(mut input): Json<CreateScene>,
) -> AppResult<(StatusCode, Json<Scene>)> {
    input.character_id = character_id;
    let scene = SceneRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(scene)))
}

/// GET /api/v1/characters/{character_id}/scenes
pub async fn list_by_character(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<Vec<Scene>>> {
    let scenes = SceneRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(scenes))
}

/// GET /api/v1/characters/{character_id}/scenes/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Scene>> {
    let scene = SceneRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))?;
    Ok(Json(scene))
}

/// PUT /api/v1/characters/{character_id}/scenes/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateScene>,
) -> AppResult<Json<Scene>> {
    let scene = SceneRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))?;
    Ok(Json(scene))
}

/// DELETE /api/v1/characters/{character_id}/scenes/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = SceneRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))
    }
}
