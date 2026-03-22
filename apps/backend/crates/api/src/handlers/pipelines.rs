//! Handlers for the `/pipelines` resource (PRD-138).
//!
//! Pipelines define distinct video generation configurations, each with
//! their own seed-image slots, naming rules, and delivery settings.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::pipeline::{CreatePipeline, Pipeline, UpdatePipeline};
use x121_db::repositories::PipelineRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Optional query parameter for filtering pipelines by active status.
#[derive(Debug, Deserialize)]
pub struct PipelineListParams {
    /// When `true`, only active pipelines. When `false`, only inactive.
    /// When omitted, all pipelines are returned.
    pub is_active: Option<bool>,
}

/// GET /api/v1/pipelines?is_active=true
///
/// List all pipelines, optionally filtering by active status.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<PipelineListParams>,
) -> AppResult<Json<DataResponse<Vec<Pipeline>>>> {
    let pipelines = PipelineRepo::list(&state.pool, params.is_active).await?;
    Ok(Json(DataResponse { data: pipelines }))
}

/// GET /api/v1/pipelines/{id}
///
/// Get a single pipeline by ID.
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Pipeline>>> {
    let pipeline = PipelineRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id,
        }))?;
    Ok(Json(DataResponse { data: pipeline }))
}

/// POST /api/v1/pipelines
///
/// Create a new pipeline.
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreatePipeline>,
) -> AppResult<(StatusCode, Json<DataResponse<Pipeline>>)> {
    let pipeline = PipelineRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: pipeline })))
}

/// PUT /api/v1/pipelines/{id}
///
/// Update a pipeline. Only non-null fields in the body are applied.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePipeline>,
) -> AppResult<Json<DataResponse<Pipeline>>> {
    let pipeline = PipelineRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id,
        }))?;
    Ok(Json(DataResponse { data: pipeline }))
}

/// DELETE /api/v1/pipelines/{id}
///
/// Soft-delete a pipeline by deactivating it (`is_active = false`).
pub async fn delete(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode> {
    let deactivated = PipelineRepo::deactivate(&state.pool, id).await?;
    if deactivated {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id,
        }))
    }
}
