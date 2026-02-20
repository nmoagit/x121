//! Handlers for the `/scene-types` resource.
//!
//! Scene types have two scopes:
//! - Project-scoped: `/projects/{project_id}/scene-types[/{id}]`
//! - Studio-level:   `/scene-types[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::scene_type::{CreateSceneType, SceneType, UpdateSceneType};
use trulience_db::repositories::SceneTypeRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Project-scoped handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/projects/{project_id}/scene-types
///
/// Overrides `input.project_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateSceneType>,
) -> AppResult<(StatusCode, Json<SceneType>)> {
    input.project_id = Some(project_id);
    let scene_type = SceneTypeRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(scene_type)))
}

/// GET /api/v1/projects/{project_id}/scene-types
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<SceneType>>> {
    let scene_types = SceneTypeRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(scene_types))
}

/// GET /api/v1/projects/{project_id}/scene-types/{id}
pub async fn get_by_id_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SceneType>> {
    get_by_id_inner(&state, id).await
}

/// PUT /api/v1/projects/{project_id}/scene-types/{id}
pub async fn update_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateSceneType>,
) -> AppResult<Json<SceneType>> {
    update_inner(&state, id, input).await
}

/// DELETE /api/v1/projects/{project_id}/scene-types/{id}
pub async fn delete_scoped(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_inner(&state, id).await
}

// ---------------------------------------------------------------------------
// Studio-level handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/scene-types
///
/// Creates a studio-level scene type (no project association).
pub async fn create_studio(
    State(state): State<AppState>,
    Json(mut input): Json<CreateSceneType>,
) -> AppResult<(StatusCode, Json<SceneType>)> {
    input.project_id = None;
    input.is_studio_level = Some(true);
    let scene_type = SceneTypeRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(scene_type)))
}

/// GET /api/v1/scene-types
pub async fn list_studio_level(State(state): State<AppState>) -> AppResult<Json<Vec<SceneType>>> {
    let scene_types = SceneTypeRepo::list_studio_level(&state.pool).await?;
    Ok(Json(scene_types))
}

/// GET /api/v1/scene-types/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<SceneType>> {
    get_by_id_inner(&state, id).await
}

/// PUT /api/v1/scene-types/{id}
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateSceneType>,
) -> AppResult<Json<SceneType>> {
    update_inner(&state, id, input).await
}

/// DELETE /api/v1/scene-types/{id}
pub async fn delete(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode> {
    delete_inner(&state, id).await
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async fn get_by_id_inner(state: &AppState, id: DbId) -> AppResult<Json<SceneType>> {
    let scene_type = SceneTypeRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))?;
    Ok(Json(scene_type))
}

async fn update_inner(
    state: &AppState,
    id: DbId,
    input: UpdateSceneType,
) -> AppResult<Json<SceneType>> {
    let scene_type = SceneTypeRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))?;
    Ok(Json(scene_type))
}

async fn delete_inner(state: &AppState, id: DbId) -> AppResult<StatusCode> {
    let deleted = SceneTypeRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))
    }
}
