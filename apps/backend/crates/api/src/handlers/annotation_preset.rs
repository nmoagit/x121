//! Handlers for annotation presets (PRD-149).
//!
//! Annotation presets are reusable label+color pairs for frame annotations,
//! optionally scoped to a pipeline.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::annotation_preset::{CreateAnnotationPreset, UpdateAnnotationPreset};
use x121_db::repositories::AnnotationPresetRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Query parameters for listing annotation presets.
#[derive(Debug, Deserialize)]
pub struct ListPresetsQuery {
    pub pipeline_id: Option<DbId>,
}

/// GET /api/v1/annotation-presets?pipeline_id=N
///
/// List annotation presets, optionally filtered by pipeline.
pub async fn list_annotation_presets(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListPresetsQuery>,
) -> AppResult<impl IntoResponse> {
    let presets = AnnotationPresetRepo::list_by_pipeline(&state.pool, params.pipeline_id).await?;
    Ok(Json(DataResponse { data: presets }))
}

/// POST /api/v1/annotation-presets
///
/// Create a new annotation preset.
pub async fn create_annotation_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateAnnotationPreset>,
) -> AppResult<impl IntoResponse> {
    let label = input.label.trim().to_string();
    if label.is_empty() {
        return Err(AppError::BadRequest("label must not be empty".to_string()));
    }

    let preset =
        AnnotationPresetRepo::create(&state.pool, &CreateAnnotationPreset { label, ..input })
            .await?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = preset.id,
        "Annotation preset created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: preset })))
}

/// PUT /api/v1/annotation-presets/{id}
///
/// Update an existing annotation preset.
pub async fn update_annotation_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateAnnotationPreset>,
) -> AppResult<impl IntoResponse> {
    // Trim label if provided.
    let input = UpdateAnnotationPreset {
        label: input.label.map(|l| l.trim().to_string()),
        ..input
    };

    if let Some(ref label) = input.label {
        if label.is_empty() {
            return Err(AppError::BadRequest("label must not be empty".to_string()));
        }
    }

    let preset = AnnotationPresetRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AnnotationPreset",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = id,
        "Annotation preset updated"
    );

    Ok(Json(DataResponse { data: preset }))
}

/// DELETE /api/v1/annotation-presets/{id}
///
/// Delete an annotation preset.
pub async fn delete_annotation_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = AnnotationPresetRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "AnnotationPreset",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        preset_id = id,
        "Annotation preset deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}
