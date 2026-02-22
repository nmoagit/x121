//! Handlers for face embedding operations on characters (PRD-76).
//!
//! Endpoints:
//! - POST   /characters/{character_id}/extract-embedding
//! - GET    /characters/{character_id}/embedding-status
//! - GET    /characters/{character_id}/detected-faces
//! - POST   /characters/{character_id}/select-face
//! - GET    /characters/{character_id}/embedding-history

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::embedding::EmbeddingStatus;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::embedding::{ExtractEmbeddingRequest, SelectFaceRequest};
use trulience_db::repositories::{CharacterRepo, EmbeddingRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Verify that a character exists, returning an error if not found.
async fn ensure_character_exists(pool: &sqlx::PgPool, character_id: DbId) -> AppResult<()> {
    CharacterRepo::find_by_id(pool, character_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Character",
                id: character_id,
            })
        })?;
    Ok(())
}

/// POST /api/v1/characters/{character_id}/extract-embedding
///
/// Trigger face embedding extraction for a character. Sets the status to
/// `Extracting` so the frontend can poll. The actual extraction happens
/// asynchronously (via a background job in a future PRD).
pub async fn extract_embedding(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    body: Option<Json<ExtractEmbeddingRequest>>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    // Validate optional confidence threshold if provided.
    if let Some(Json(ref req)) = body {
        if let Some(threshold) = req.confidence_threshold {
            trulience_core::embedding::validate_confidence_threshold(threshold)?;
        }
    }

    // Archive the current embedding if one exists before starting new extraction.
    EmbeddingRepo::archive_embedding(&state.pool, character_id).await?;

    // Clear any previously detected faces.
    EmbeddingRepo::clear_detected_faces(&state.pool, character_id).await?;

    // Set status to Extracting.
    EmbeddingRepo::update_character_embedding_status(
        &state.pool,
        character_id,
        EmbeddingStatus::Extracting.id(),
    )
    .await?;

    tracing::info!(
        character_id = character_id,
        "Face embedding extraction triggered"
    );

    let status = EmbeddingRepo::get_embedding_status(&state.pool, character_id).await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(DataResponse { data: status }),
    ))
}

/// GET /api/v1/characters/{character_id}/embedding-status
///
/// Return the current embedding status for a character.
pub async fn get_embedding_status(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    let status = EmbeddingRepo::get_embedding_status(&state.pool, character_id).await?;

    Ok(Json(DataResponse { data: status }))
}

/// GET /api/v1/characters/{character_id}/detected-faces
///
/// List all detected faces for a character (multi-face selection scenario).
pub async fn get_detected_faces(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    let faces = EmbeddingRepo::list_detected_faces(&state.pool, character_id).await?;

    Ok(Json(DataResponse { data: faces }))
}

/// POST /api/v1/characters/{character_id}/select-face
///
/// Select a detected face as the primary face for the character.
/// Copies the face's embedding to the character and sets status to Completed.
pub async fn select_face(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(input): Json<SelectFaceRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    EmbeddingRepo::select_primary_face(&state.pool, character_id, input.face_id).await?;

    tracing::info!(
        character_id = character_id,
        face_id = input.face_id,
        "Primary face selected for character"
    );

    let status = EmbeddingRepo::get_embedding_status(&state.pool, character_id).await?;

    Ok(Json(DataResponse { data: status }))
}

/// GET /api/v1/characters/{character_id}/embedding-history
///
/// Return the embedding replacement history for a character.
pub async fn get_embedding_history(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_character_exists(&state.pool, character_id).await?;

    let history = EmbeddingRepo::get_embedding_history(&state.pool, character_id).await?;

    Ok(Json(DataResponse { data: history }))
}
