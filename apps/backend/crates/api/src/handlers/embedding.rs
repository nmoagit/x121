//! Handlers for face embedding operations on avatars (PRD-76).
//!
//! Endpoints:
//! - POST   /avatars/{avatar_id}/extract-embedding
//! - GET    /avatars/{avatar_id}/embedding-status
//! - GET    /avatars/{avatar_id}/detected-faces
//! - POST   /avatars/{avatar_id}/select-face
//! - GET    /avatars/{avatar_id}/embedding-history

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::embedding::EmbeddingStatus;
use x121_core::types::DbId;
use x121_db::models::embedding::{ExtractEmbeddingRequest, SelectFaceRequest};
use x121_db::repositories::EmbeddingRepo;

use crate::error::AppResult;
use crate::handlers::consistency_report::ensure_avatar_exists;
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/avatars/{avatar_id}/extract-embedding
///
/// Trigger face embedding extraction for a avatar. Sets the status to
/// `Extracting` so the frontend can poll. The actual extraction happens
/// asynchronously (via a background job in a future PRD).
pub async fn extract_embedding(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    body: Option<Json<ExtractEmbeddingRequest>>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    // Validate optional confidence threshold if provided.
    if let Some(Json(ref req)) = body {
        if let Some(threshold) = req.confidence_threshold {
            x121_core::embedding::validate_confidence_threshold(threshold)?;
        }
    }

    // Archive the current embedding if one exists before starting new extraction.
    EmbeddingRepo::archive_embedding(&state.pool, avatar_id).await?;

    // Clear any previously detected faces.
    EmbeddingRepo::clear_detected_faces(&state.pool, avatar_id).await?;

    // Set status to Extracting.
    EmbeddingRepo::update_avatar_embedding_status(
        &state.pool,
        avatar_id,
        EmbeddingStatus::Extracting.id(),
    )
    .await?;

    tracing::info!(avatar_id = avatar_id, "Face embedding extraction triggered");

    let status = EmbeddingRepo::get_embedding_status(&state.pool, avatar_id).await?;

    Ok((StatusCode::ACCEPTED, Json(DataResponse { data: status })))
}

/// GET /api/v1/avatars/{avatar_id}/embedding-status
///
/// Return the current embedding status for a avatar.
pub async fn get_embedding_status(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    let status = EmbeddingRepo::get_embedding_status(&state.pool, avatar_id).await?;

    Ok(Json(DataResponse { data: status }))
}

/// GET /api/v1/avatars/{avatar_id}/detected-faces
///
/// List all detected faces for a avatar (multi-face selection scenario).
pub async fn get_detected_faces(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    let faces = EmbeddingRepo::list_detected_faces(&state.pool, avatar_id).await?;

    Ok(Json(DataResponse { data: faces }))
}

/// POST /api/v1/avatars/{avatar_id}/select-face
///
/// Select a detected face as the primary face for the avatar.
/// Copies the face's embedding to the avatar and sets status to Completed.
pub async fn select_face(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(input): Json<SelectFaceRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    EmbeddingRepo::select_primary_face(&state.pool, avatar_id, input.face_id).await?;

    tracing::info!(
        avatar_id = avatar_id,
        face_id = input.face_id,
        "Primary face selected for avatar"
    );

    let status = EmbeddingRepo::get_embedding_status(&state.pool, avatar_id).await?;

    Ok(Json(DataResponse { data: status }))
}

/// GET /api/v1/avatars/{avatar_id}/embedding-history
///
/// Return the embedding replacement history for a avatar.
pub async fn get_embedding_history(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    let history = EmbeddingRepo::get_embedding_history(&state.pool, avatar_id).await?;

    Ok(Json(DataResponse { data: history }))
}
