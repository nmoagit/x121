//! Handlers for project speech configuration (PRD-136).
//!
//! Routes nested under `/projects/{project_id}/speech-config`.
//! Manages the per-project requirements for speech types, languages, and
//! minimum variant counts.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::types::DbId;
use x121_db::models::project_speech_config::SpeechConfigEntry;
use x121_db::repositories::{LanguageRepo, ProjectSpeechConfigRepo, SpeechTypeRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Request body for setting project speech config.
#[derive(Debug, Deserialize)]
pub struct SetSpeechConfigRequest {
    pub entries: Vec<SpeechConfigEntry>,
}

/// GET /projects/{project_id}/speech-config
///
/// Returns the speech config for a project. If no config exists, returns
/// defaults (all speech types x English x 3 min_variants).
pub async fn get_speech_config(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let config = ProjectSpeechConfigRepo::list_for_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: config }))
}

/// PUT /projects/{project_id}/speech-config
///
/// Replace the entire speech config for a project. Validates that all
/// referenced speech type IDs and language IDs exist.
pub async fn set_speech_config(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(body): Json<SetSpeechConfigRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate all referenced IDs exist.
    let types = SpeechTypeRepo::list_all(&state.pool).await?;
    let languages = LanguageRepo::list_all(&state.pool).await?;

    let valid_type_ids: std::collections::HashSet<i16> = types.iter().map(|t| t.id).collect();
    let valid_lang_ids: std::collections::HashSet<i16> = languages.iter().map(|l| l.id).collect();

    for entry in &body.entries {
        if !valid_type_ids.contains(&entry.speech_type_id) {
            return Err(AppError::BadRequest(format!(
                "Unknown speech_type_id: {}",
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
        ProjectSpeechConfigRepo::replace_all(&state.pool, project_id, &body.entries).await?;

    tracing::info!(
        user_id = auth.user_id,
        project_id = project_id,
        entries = body.entries.len(),
        "Project speech config updated"
    );

    Ok(Json(DataResponse { data: config }))
}
