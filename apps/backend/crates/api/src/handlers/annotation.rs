//! Handlers for on-frame annotation and markup (PRD-70).
//!
//! Provides endpoints for creating, listing, updating, and deleting
//! frame annotations on segments, plus summary and export endpoints.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::annotation::{validate_annotations_json, validate_frame_number};
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::frame_annotation::{
    CreateFrameAnnotation, CreateVersionAnnotation, UpdateFrameAnnotation,
};
use x121_db::repositories::{FrameAnnotationRepo, SceneVideoVersionRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
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

/// Query parameters for browsing all annotated items.
#[derive(Debug, Deserialize)]
pub struct AnnotationBrowseParams {
    pub project_id: Option<DbId>,
    pub character_id: Option<DbId>,
    pub sort: Option<String>,
    pub sort_dir: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
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
        .flat_map(|a| a.annotations_json.as_array().cloned().unwrap_or_default())
        .collect();

    Ok(Json(DataResponse { data: all_objects }))
}

/* --------------------------------------------------------------------------
Browse all annotated items
-------------------------------------------------------------------------- */

/// GET /annotations/browse
///
/// Browse all annotated items with full context (character, scene, project).
pub async fn browse_annotations(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<AnnotationBrowseParams>,
) -> AppResult<impl IntoResponse> {
    let sort = params.sort.as_deref().unwrap_or("created_at");
    let sort_dir = params.sort_dir.as_deref().unwrap_or("desc");
    let limit = clamp_limit(params.pagination.limit, 100, 500);
    let offset = clamp_offset(params.pagination.offset);

    let items = FrameAnnotationRepo::browse(
        &state.pool,
        params.project_id,
        params.character_id,
        sort,
        sort_dir,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: items }))
}

/* --------------------------------------------------------------------------
Version-scoped annotation handlers (clip review)
-------------------------------------------------------------------------- */

/// GET /scenes/{scene_id}/versions/{id}/annotations
///
/// List all annotations for a video version, ordered by frame number.
pub async fn list_version_annotations(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    let annotations = FrameAnnotationRepo::list_by_version(&state.pool, version_id).await?;
    Ok(Json(DataResponse { data: annotations }))
}

/// PUT /scenes/{scene_id}/versions/{id}/annotations/{frame}
///
/// Upsert annotations for a specific frame on a video version.
/// Replaces all existing annotations for that version+frame.
/// Send an empty `annotations_json` array to clear annotations for the frame.
pub async fn upsert_version_annotation(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, version_id, frame)): Path<(DbId, DbId, i32)>,
    Json(input): Json<CreateVersionAnnotation>,
) -> AppResult<impl IntoResponse> {
    // Ensure the version exists.
    SceneVideoVersionRepo::find_by_id(&state.pool, version_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SceneVideoVersion",
                id: version_id,
            })
        })?;

    validate_frame_number(frame).map_err(AppError::Core)?;
    validate_annotations_json(&input.annotations_json).map_err(AppError::Core)?;

    let result = FrameAnnotationRepo::upsert_version_frame(
        &state.pool,
        version_id,
        auth.user_id,
        frame,
        &input.annotations_json,
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        version_id,
        frame_number = frame,
        "Version annotation upserted"
    );

    match result {
        Some(annotation) => Ok(Json(DataResponse {
            data: Some(annotation),
        })),
        None => Ok(Json(DataResponse { data: None })),
    }
}

/// DELETE /scenes/{scene_id}/versions/{id}/annotations/{frame}
///
/// Delete all annotations for a specific frame on a video version.
pub async fn delete_version_frame_annotations(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, version_id, frame)): Path<(DbId, DbId, i32)>,
) -> AppResult<impl IntoResponse> {
    let deleted =
        FrameAnnotationRepo::delete_by_version_and_frame(&state.pool, version_id, frame).await?;

    tracing::info!(
        user_id = auth.user_id,
        version_id,
        frame_number = frame,
        rows_deleted = deleted,
        "Version frame annotations deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}
