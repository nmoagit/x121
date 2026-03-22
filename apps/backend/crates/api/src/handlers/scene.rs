//! Handlers for the `/scenes` resource.
//!
//! Scenes are nested under avatars:
//! `/avatars/{avatar_id}/scenes[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene::{CreateScene, Scene, SceneWithVersion, UpdateScene};
use x121_db::repositories::SceneRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/avatars/{avatar_id}/scenes
///
/// Overrides `input.avatar_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(mut input): Json<CreateScene>,
) -> AppResult<(StatusCode, Json<DataResponse<Scene>>)> {
    input.avatar_id = avatar_id;
    let scene = SceneRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: scene })))
}

/// GET /api/v1/avatars/{avatar_id}/scenes
///
/// Returns scenes with their best video version ID and version count,
/// eliminating the N+1 query pattern on the frontend.
pub async fn list_by_avatar(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneWithVersion>>>> {
    let scenes = SceneRepo::list_by_avatar_with_versions(&state.pool, avatar_id).await?;
    Ok(Json(DataResponse { data: scenes }))
}

/// GET /api/v1/avatars/{avatar_id}/scenes/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Scene>>> {
    let scene = SceneRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))?;
    Ok(Json(DataResponse { data: scene }))
}

/// PUT /api/v1/avatars/{avatar_id}/scenes/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateScene>,
) -> AppResult<Json<DataResponse<Scene>>> {
    let scene = SceneRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))?;
    Ok(Json(DataResponse { data: scene }))
}

/// DELETE /api/v1/avatars/{avatar_id}/scenes/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
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
