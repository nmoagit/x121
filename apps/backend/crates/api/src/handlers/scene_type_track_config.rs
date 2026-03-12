//! Handlers for per-(scene_type, track) workflow and prompt overrides.
//!
//! Endpoints are nested under `/scene-types/{scene_type_id}/track-configs`.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::scene_type_track_config::{
    CreateSceneTypeTrackConfig, SceneTypeTrackConfig, SceneTypeTrackConfigWithTrack,
    UpdateSceneTypeTrackConfig,
};
use x121_db::repositories::SceneTypeTrackConfigRepo;

use crate::error::{AppError, AppResult};
use crate::handlers::scene_type_inheritance::ensure_scene_type_exists;
use crate::response::DataResponse;
use crate::state::AppState;

/// Query parameter for clothes-off variant selection.
#[derive(Debug, Deserialize)]
pub struct ClothesOffParam {
    #[serde(default)]
    pub is_clothes_off: bool,
}

/// GET /api/v1/scene-types/{scene_type_id}/track-configs
///
/// List all track configs for a scene type, enriched with track name/slug.
pub async fn list(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<SceneTypeTrackConfigWithTrack>>>> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;
    let configs = SceneTypeTrackConfigRepo::list_by_scene_type(&state.pool, scene_type_id).await?;
    Ok(Json(DataResponse { data: configs }))
}

/// GET /api/v1/scene-types/{scene_type_id}/track-configs/{track_id}?is_clothes_off=true
///
/// Get a single track config by scene type, track, and clothes-off flag.
pub async fn get(
    State(state): State<AppState>,
    Path((scene_type_id, track_id)): Path<(DbId, DbId)>,
    Query(params): Query<ClothesOffParam>,
) -> AppResult<Json<DataResponse<SceneTypeTrackConfig>>> {
    let config = SceneTypeTrackConfigRepo::find_by_scene_type_and_track(
        &state.pool,
        scene_type_id,
        track_id,
        params.is_clothes_off,
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "SceneTypeTrackConfig",
        id: track_id,
    }))?;
    Ok(Json(DataResponse { data: config }))
}

/// PUT /api/v1/scene-types/{scene_type_id}/track-configs/{track_id}
///
/// Upsert a track config. Creates if not exists, updates if it does.
pub async fn upsert(
    State(state): State<AppState>,
    Path((scene_type_id, track_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateSceneTypeTrackConfig>,
) -> AppResult<Json<DataResponse<SceneTypeTrackConfig>>> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;

    let input = CreateSceneTypeTrackConfig {
        scene_type_id,
        track_id,
        is_clothes_off: body.is_clothes_off,
        workflow_id: body.workflow_id,
        prompt_template: body.prompt_template,
        negative_prompt_template: body.negative_prompt_template,
        prompt_start_clip: body.prompt_start_clip,
        negative_prompt_start_clip: body.negative_prompt_start_clip,
        prompt_continuation_clip: body.prompt_continuation_clip,
        negative_prompt_continuation_clip: body.negative_prompt_continuation_clip,
    };

    let config = SceneTypeTrackConfigRepo::upsert(&state.pool, &input).await?;
    Ok(Json(DataResponse { data: config }))
}

/// DELETE /api/v1/scene-types/{scene_type_id}/track-configs/{track_id}?is_clothes_off=true
///
/// Delete a track config by scene type, track, and clothes-off flag.
pub async fn delete(
    State(state): State<AppState>,
    Path((scene_type_id, track_id)): Path<(DbId, DbId)>,
    Query(params): Query<ClothesOffParam>,
) -> AppResult<StatusCode> {
    let deleted = SceneTypeTrackConfigRepo::delete_by_scene_type_and_track(
        &state.pool,
        scene_type_id,
        track_id,
        params.is_clothes_off,
    )
    .await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneTypeTrackConfig",
            id: track_id,
        }))
    }
}
