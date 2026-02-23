//! Handlers for on-frame annotation and markup (PRD-70).
//!
//! Provides endpoints for creating, listing, updating, and deleting
//! frame annotations on segments, plus summary and export endpoints.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use trulience_core::annotation::{validate_annotations_json, validate_frame_number};
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::frame_annotation::{CreateFrameAnnotation, UpdateFrameAnnotation};
use trulience_db::repositories::FrameAnnotationRepo;

use crate::error::{AppError, AppResult};
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/* --------------------------------------------------------------------------
   Query filters
   -------------------------------------------------------------------------- */

/// Optional query filters for listing annotations.
#[derive(Debug, Deserialize)]
pub struct AnnotationListFilters {
    pub user_id: Option<DbId>,
    pub frame_number: Option<i32>,
}

/* --------------------------------------------------------------------------
   Handlers
   -------------------------------------------------------------------------- */

/// GET /segments/{id}/annotations
///
/// List annotations for a segment with optional user_id and frame_number filters.
pub async fn list_annotations(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Query(filters): Query<AnnotationListFilters>,
) -> AppResult<impl IntoResponse> {
    let annotations = match (filters.user_id, filters.frame_number) {
        (Some(user_id), _) => {
            FrameAnnotationRepo::list_by_segment_and_user(&state.pool, segment_id, user_id).await?
        }
        (_, Some(frame)) => {
            FrameAnnotationRepo::list_by_segment_and_frame(&state.pool, segment_id, frame).await?
        }
        _ => FrameAnnotationRepo::list_by_segment(&state.pool, segment_id).await?,
    };
    Ok(Json(DataResponse { data: annotations }))
}

/// POST /segments/{id}/annotations
///
/// Create a new frame annotation on a segment.
pub async fn create_annotation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<CreateFrameAnnotation>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    // Validate frame number.
    validate_frame_number(input.frame_number).map_err(AppError::Core)?;

    // Validate annotations JSON.
    validate_annotations_json(&input.annotations_json).map_err(AppError::Core)?;

    let annotation =
        FrameAnnotationRepo::create(&state.pool, segment_id, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        annotation_id = annotation.id,
        frame_number = input.frame_number,
        "Frame annotation created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: annotation })))
}

/// GET /segments/{id}/annotations/{ann_id}
///
/// Get a single frame annotation by ID.
pub async fn get_annotation(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, ann_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let annotation = FrameAnnotationRepo::find_by_id(&state.pool, ann_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "FrameAnnotation",
                id: ann_id,
            })
        })?;
    Ok(Json(DataResponse { data: annotation }))
}

/// PUT /segments/{id}/annotations/{ann_id}
///
/// Update a frame annotation's data or review note link.
pub async fn update_annotation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, ann_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateFrameAnnotation>,
) -> AppResult<impl IntoResponse> {
    // Validate annotations JSON if provided.
    if let Some(ref json) = input.annotations_json {
        validate_annotations_json(json).map_err(AppError::Core)?;
    }

    let annotation = FrameAnnotationRepo::update(&state.pool, ann_id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "FrameAnnotation",
                id: ann_id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        annotation_id = ann_id,
        "Frame annotation updated"
    );

    Ok(Json(DataResponse { data: annotation }))
}

/// DELETE /segments/{id}/annotations/{ann_id}
///
/// Delete a frame annotation.
pub async fn delete_annotation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, ann_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let deleted = FrameAnnotationRepo::delete(&state.pool, ann_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "FrameAnnotation",
            id: ann_id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        annotation_id = ann_id,
        "Frame annotation deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

/// GET /segments/{id}/annotations/summary
///
/// Get aggregated annotation summary for a segment.
pub async fn annotation_summary(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let summary = FrameAnnotationRepo::summary(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: summary }))
}

/// GET /segments/{id}/annotations/export/{frame}
///
/// Returns JSON with annotation data for a specific frame,
/// suitable for client-side PNG compositing.
pub async fn export_frame(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((segment_id, frame)): Path<(DbId, i32)>,
) -> AppResult<impl IntoResponse> {
    validate_frame_number(frame).map_err(AppError::Core)?;

    let annotations =
        FrameAnnotationRepo::list_by_segment_and_frame(&state.pool, segment_id, frame).await?;

    // Collect all annotation JSON arrays into a flat list for easy compositing.
    let all_objects: Vec<serde_json::Value> = annotations
        .iter()
        .flat_map(|a| {
            a.annotations_json
                .as_array()
                .cloned()
                .unwrap_or_default()
        })
        .collect();

    Ok(Json(DataResponse { data: all_objects }))
}
