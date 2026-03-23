//! Handlers for pipeline speech configuration (PRD-143).
//!
//! Routes nested under `/pipelines/{id}/speech-config`.
//! Manages per-pipeline default speech variant requirements.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::pipeline_speech_config::PipelineSpeechConfigEntry;
use x121_db::repositories::{LanguageRepo, PipelineRepo, PipelineSpeechConfigRepo, SpeechTypeRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for bulk upserting pipeline speech config.
#[derive(Debug, Deserialize)]
pub struct SetPipelineSpeechConfigRequest {
    pub entries: Vec<PipelineSpeechConfigEntry>,
}

/// GET /api/v1/pipelines/{id}/speech-config
///
/// List all speech config entries for a pipeline.
pub async fn list_speech_config(
    State(state): State<AppState>,
    Path(pipeline_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify pipeline exists.
    PipelineRepo::find_by_id(&state.pool, pipeline_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id: pipeline_id,
        }))?;

    let config = PipelineSpeechConfigRepo::list_by_pipeline(&state.pool, pipeline_id).await?;
    Ok(Json(DataResponse { data: config }))
}

/// PUT /api/v1/pipelines/{id}/speech-config
///
/// Bulk upsert speech config entries for a pipeline. Validates that all
/// referenced speech type and language IDs exist and that speech types
/// belong to this pipeline.
pub async fn set_speech_config(
    State(state): State<AppState>,
    Path(pipeline_id): Path<DbId>,
    Json(body): Json<SetPipelineSpeechConfigRequest>,
) -> AppResult<impl IntoResponse> {
    // Verify pipeline exists.
    PipelineRepo::find_by_id(&state.pool, pipeline_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id: pipeline_id,
        }))?;

    // Validate speech types belong to this pipeline.
    let types = SpeechTypeRepo::list_by_pipeline(&state.pool, pipeline_id).await?;
    let valid_type_ids: std::collections::HashSet<i16> = types.iter().map(|t| t.id).collect();

    let languages = LanguageRepo::list_all(&state.pool).await?;
    let valid_lang_ids: std::collections::HashSet<i16> = languages.iter().map(|l| l.id).collect();

    for entry in &body.entries {
        if !valid_type_ids.contains(&entry.speech_type_id) {
            return Err(AppError::BadRequest(format!(
                "speech_type_id {} does not belong to this pipeline",
                entry.speech_type_id
            )));
        }
        if !valid_lang_ids.contains(&entry.language_id) {
            return Err(AppError::BadRequest(format!(
                "Unknown language_id: {}",
                entry.language_id
            )));
        }
        if entry.min_variants < 0 {
            return Err(AppError::BadRequest(
                "min_variants must be non-negative".to_string(),
            ));
        }
    }

    let config =
        PipelineSpeechConfigRepo::bulk_upsert(&state.pool, pipeline_id, &body.entries).await?;
    Ok(Json(DataResponse { data: config }))
}

/// DELETE /api/v1/pipelines/{id}/speech-config/{config_id}
///
/// Delete a single pipeline speech config entry.
pub async fn delete_speech_config(
    State(state): State<AppState>,
    Path((pipeline_id, config_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    // Verify pipeline exists.
    PipelineRepo::find_by_id(&state.pool, pipeline_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Pipeline",
            id: pipeline_id,
        }))?;

    let deleted = PipelineSpeechConfigRepo::delete(&state.pool, config_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "PipelineSpeechConfig",
            id: config_id,
        }))
    }
}
