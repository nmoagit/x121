//! Handlers for the `/speech-types` resource (PRD-124).
//!
//! Speech types are a seeded, user-extensible lookup table for categorizing
//! character speech entries.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_db::repositories::SpeechTypeRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for creating a speech type.
#[derive(Debug, Deserialize)]
pub struct CreateSpeechTypeRequest {
    pub name: String,
}

/// GET /api/v1/speech-types
///
/// List all speech types, ordered by name.
pub async fn list_speech_types(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let types = SpeechTypeRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: types }))
}

/// POST /api/v1/speech-types
///
/// Create a new speech type. Returns 409 if a type with the same name exists.
pub async fn create_speech_type(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateSpeechTypeRequest>,
) -> AppResult<impl IntoResponse> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".to_string()));
    }

    // Check for existing type to return a clear 409.
    if SpeechTypeRepo::find_by_name(&state.pool, &name)
        .await?
        .is_some()
    {
        return Err(AppError::Core(CoreError::Conflict(format!(
            "Speech type '{name}' already exists"
        ))));
    }

    let speech_type = SpeechTypeRepo::create(&state.pool, &name).await?;

    tracing::info!(
        user_id = auth.user_id,
        speech_type_id = speech_type.id,
        name = %name,
        "Speech type created"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse { data: speech_type }),
    ))
}
