//! Handlers for the `/segments` resource.
//!
//! Segments are nested under scenes:
//! `/scenes/{scene_id}/segments[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::segment::{CreateSegment, Segment, UpdateSegment};
use trulience_db::repositories::SegmentRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/scenes/{scene_id}/segments
///
/// Overrides `input.scene_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    Json(mut input): Json<CreateSegment>,
) -> AppResult<(StatusCode, Json<Segment>)> {
    input.scene_id = scene_id;
    let segment = SegmentRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(segment)))
}

/// GET /api/v1/scenes/{scene_id}/segments
pub async fn list_by_scene(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<Json<Vec<Segment>>> {
    let segments = SegmentRepo::list_by_scene(&state.pool, scene_id).await?;
    Ok(Json(segments))
}

/// GET /api/v1/scenes/{scene_id}/segments/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Segment>> {
    let segment = SegmentRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Segment",
            id,
        }))?;
    Ok(Json(segment))
}

/// PUT /api/v1/scenes/{scene_id}/segments/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateSegment>,
) -> AppResult<Json<Segment>> {
    let segment = SegmentRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Segment",
            id,
        }))?;
    Ok(Json(segment))
}

/// DELETE /api/v1/scenes/{scene_id}/segments/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = SegmentRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Segment",
            id,
        }))
    }
}
