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
use x121_db::repositories::{MetadataTemplateRepo, PipelineRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

use x121_db::models::metadata_template::MetadataTemplate;

/// Shared lookup — returns the pipeline or a 404 error.
async fn ensure_pipeline_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Pipeline> {
    PipelineRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id,
        }))
}

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
    let pipeline = ensure_pipeline_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: pipeline }))
}

/// GET /api/v1/pipelines/code/{code}
///
/// Get a single pipeline by its unique code (e.g., "x121", "y122").
pub async fn get_by_code(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> AppResult<Json<DataResponse<Pipeline>>> {
    let pipeline = PipelineRepo::find_by_code(&state.pool, &code)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id: 0,
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

// ---------------------------------------------------------------------------
// Metadata template routes
// ---------------------------------------------------------------------------

/// GET /api/v1/pipelines/{id}/metadata-template
///
/// Get the default metadata template for a pipeline.
pub async fn get_metadata_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Option<MetadataTemplate>>>> {
    ensure_pipeline_exists(&state.pool, id).await?;
    let template = MetadataTemplateRepo::find_default(&state.pool, None, Some(id)).await?;
    Ok(Json(DataResponse { data: template }))
}

/// Request body for setting a pipeline's metadata template.
#[derive(Debug, Deserialize)]
pub struct SetMetadataTemplateRequest {
    pub template_id: DbId,
}

/// PUT /api/v1/pipelines/{id}/metadata-template
///
/// Set the default metadata template for a pipeline by marking the specified
/// template as the pipeline default.
pub async fn set_metadata_template(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<SetMetadataTemplateRequest>,
) -> AppResult<Json<DataResponse<MetadataTemplate>>> {
    ensure_pipeline_exists(&state.pool, id).await?;

    let template = MetadataTemplateRepo::find_by_id(&state.pool, body.template_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "MetadataTemplate",
            id: body.template_id,
        }))?;

    // Clear any existing pipeline default.
    sqlx::query(
        "UPDATE metadata_templates SET is_default = false \
         WHERE pipeline_id = $1 AND project_id IS NULL AND is_default = true",
    )
    .bind(id)
    .execute(&state.pool)
    .await?;

    // Set the new default. Update pipeline_id and is_default.
    let query = format!(
        "UPDATE metadata_templates SET is_default = true, pipeline_id = $2 \
         WHERE id = $1 \
         RETURNING {}", "id, name, description, project_id, pipeline_id, is_default, version, created_at, updated_at"
    );
    let updated = sqlx::query_as::<_, MetadataTemplate>(&query)
        .bind(template.id)
        .bind(id)
        .fetch_one(&state.pool)
        .await?;

    Ok(Json(DataResponse { data: updated }))
}
