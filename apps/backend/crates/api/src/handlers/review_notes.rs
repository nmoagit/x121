//! Handlers for collaborative review notes and tags (PRD-38).
//!
//! Provides endpoints for creating, updating, and resolving review notes
//! on segments, managing failure tags, and associating tags with notes.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::review::{
    validate_note_content, validate_note_status, validate_tag_color, validate_timecode,
    NOTE_STATUS_RESOLVED,
};
use x121_core::types::DbId;
use x121_db::models::review_note::{CreateReviewNote, CreateReviewTag, UpdateReviewNote};
use x121_db::repositories::{ReviewNoteRepo, ReviewTagRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/* --------------------------------------------------------------------------
Helpers
-------------------------------------------------------------------------- */

/// Verify that a review note exists, returning an error if not found.
async fn ensure_note_exists(pool: &sqlx::PgPool, note_id: DbId) -> AppResult<()> {
    ReviewNoteRepo::find_by_id(pool, note_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReviewNote",
                id: note_id,
            })
        })?;
    Ok(())
}

/* --------------------------------------------------------------------------
Note handlers
-------------------------------------------------------------------------- */

/// GET /segments/{id}/notes
///
/// List all review notes for a segment.
pub async fn list_notes(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let notes = ReviewNoteRepo::list_for_segment(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: notes }))
}

/// POST /segments/{id}/notes
///
/// Create a new review note on a segment, optionally with tags.
pub async fn create_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(mut input): Json<CreateReviewNote>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    // Override segment_id from the path.
    input.segment_id = segment_id;

    // Validate content.
    validate_note_content(&input.text_content, &input.voice_memo_path).map_err(AppError::Core)?;

    // Validate timecode if provided.
    if let Some(ref tc) = input.timecode {
        validate_timecode(tc).map_err(AppError::Core)?;
    }

    let note = ReviewNoteRepo::create(&state.pool, auth.user_id, &input).await?;

    // Assign tags if provided.
    if let Some(ref tag_ids) = input.tag_ids {
        if !tag_ids.is_empty() {
            ReviewNoteRepo::assign_tags(&state.pool, note.id, tag_ids).await?;
        }
    }

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        note_id = note.id,
        "Review note created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: note })))
}

/// PUT /segments/{id}/notes/{note_id}
///
/// Update a review note's text content or status.
pub async fn update_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((segment_id, note_id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateReviewNote>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;
    ensure_note_exists(&state.pool, note_id).await?;

    // Validate status if provided.
    if let Some(ref status) = input.status {
        validate_note_status(status).map_err(AppError::Core)?;
    }

    let note = ReviewNoteRepo::update(&state.pool, note_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note_id,
        "Review note updated"
    );

    Ok(Json(DataResponse { data: note }))
}

/// DELETE /segments/{id}/notes/{note_id}
///
/// Delete a review note.
pub async fn delete_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, note_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_note_exists(&state.pool, note_id).await?;

    ReviewNoteRepo::delete(&state.pool, note_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note_id,
        "Review note deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /segments/{id}/notes/{note_id}/resolve
///
/// Mark a review note as resolved.
pub async fn resolve_note(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, note_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_note_exists(&state.pool, note_id).await?;

    let note = ReviewNoteRepo::update_status(&state.pool, note_id, NOTE_STATUS_RESOLVED).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note_id,
        "Review note resolved"
    );

    Ok(Json(DataResponse { data: note }))
}

/* --------------------------------------------------------------------------
Tag handlers
-------------------------------------------------------------------------- */

/// GET /review-tags
///
/// List all review tags with optional frequency data.
pub async fn list_tags(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let tags = ReviewTagRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: tags }))
}

/// POST /review-tags
///
/// Create a new custom review tag.
pub async fn create_tag(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateReviewTag>,
) -> AppResult<impl IntoResponse> {
    // Validate color if provided.
    if let Some(ref color) = input.color {
        validate_tag_color(color).map_err(AppError::Core)?;
    }

    let tag = ReviewTagRepo::create(&state.pool, &input, Some(auth.user_id)).await?;

    tracing::info!(
        user_id = auth.user_id,
        tag_id = tag.id,
        tag_name = %tag.name,
        "Review tag created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: tag })))
}

/// DELETE /review-tags/{id}
///
/// Delete a review tag.
pub async fn delete_tag(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ReviewTagRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReviewTag",
                id,
            })
        })?;

    ReviewTagRepo::delete(&state.pool, id).await?;

    tracing::info!(user_id = auth.user_id, tag_id = id, "Review tag deleted");

    Ok(StatusCode::NO_CONTENT)
}

/* --------------------------------------------------------------------------
Note-tag association handlers
-------------------------------------------------------------------------- */

/// Request body for assigning tags to a note.
#[derive(Debug, serde::Deserialize)]
pub struct AssignTagsInput {
    pub tag_ids: Vec<DbId>,
}

/// POST /segments/{id}/notes/{note_id}/tags
///
/// Assign tags to a review note.
pub async fn assign_note_tags(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, note_id)): Path<(DbId, DbId)>,
    Json(input): Json<AssignTagsInput>,
) -> AppResult<impl IntoResponse> {
    ensure_note_exists(&state.pool, note_id).await?;

    let associations = ReviewNoteRepo::assign_tags(&state.pool, note_id, &input.tag_ids).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note_id,
        tag_count = input.tag_ids.len(),
        "Tags assigned to review note"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse { data: associations }),
    ))
}

/// DELETE /segments/{id}/notes/{note_id}/tags/{tag_id}
///
/// Remove a tag from a review note.
pub async fn remove_note_tag(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_segment_id, note_id, tag_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_note_exists(&state.pool, note_id).await?;

    ReviewNoteRepo::remove_tag(&state.pool, note_id, tag_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        note_id = note_id,
        tag_id = tag_id,
        "Tag removed from review note"
    );

    Ok(StatusCode::NO_CONTENT)
}
