//! Handlers for the `/languages` resource (PRD-136).
//!
//! Languages are a seeded, user-extensible lookup table for multilingual
//! speech support.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_db::repositories::LanguageRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for creating a language.
#[derive(Debug, Deserialize)]
pub struct CreateLanguageRequest {
    pub code: String,
    pub name: String,
    pub flag_code: String,
}

/// GET /api/v1/languages
///
/// List all languages, ordered by name.
pub async fn list_languages(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let languages = LanguageRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: languages }))
}

/// POST /api/v1/languages
///
/// Create a new language. Returns 409 if a language with the same code exists.
pub async fn create_language(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateLanguageRequest>,
) -> AppResult<impl IntoResponse> {
    let code = body.code.trim().to_lowercase();
    let name = body.name.trim().to_string();
    let flag_code = body.flag_code.trim().to_lowercase();

    if code.is_empty() {
        return Err(AppError::BadRequest("code must not be empty".to_string()));
    }
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".to_string()));
    }
    if flag_code.is_empty() {
        return Err(AppError::BadRequest(
            "flag_code must not be empty".to_string(),
        ));
    }

    // Check for existing language by code.
    if LanguageRepo::find_by_code(&state.pool, &code)
        .await?
        .is_some()
    {
        return Err(AppError::BadRequest(format!(
            "Language with code '{code}' already exists"
        )));
    }

    let language = LanguageRepo::create(&state.pool, &code, &name, &flag_code).await?;

    tracing::info!(
        user_id = auth.user_id,
        language_id = language.id,
        code = %code,
        "Language created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: language })))
}
