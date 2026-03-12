//! Handlers for the `/characters` resource.
//!
//! Characters are nested under projects:
//! `/projects/{project_id}/characters[/{id}]`
//!
//! Settings sub-resource:
//! `/projects/{project_id}/characters/{id}/settings`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::character_dashboard::SETTING_KEY_VOICE;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::{
    Character, CharacterWithAvatar, CreateCharacter, UpdateCharacter,
};
use x121_db::repositories::CharacterRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/projects/{project_id}/characters
///
/// Overrides `input.project_id` with the value from the URL path to ensure
/// the character is created under the correct project.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateCharacter>,
) -> AppResult<(StatusCode, Json<DataResponse<Character>>)> {
    input.project_id = project_id;
    let character = CharacterRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: character })))
}

/// Request body for bulk character creation.
#[derive(serde::Deserialize)]
pub struct BulkCreateRequest {
    pub names: Vec<String>,
    pub group_id: Option<DbId>,
}

/// POST /api/v1/projects/{project_id}/characters/bulk
///
/// Creates multiple characters at once from a list of names.
pub async fn bulk_create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<BulkCreateRequest>,
) -> AppResult<(StatusCode, Json<DataResponse<Vec<Character>>>)> {
    let characters =
        CharacterRepo::create_many(&state.pool, project_id, &input.names, input.group_id).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: characters })))
}

/// GET /api/v1/projects/{project_id}/characters
///
/// Returns characters with their best avatar variant ID pre-resolved,
/// eliminating the N+1 query pattern on the frontend.
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CharacterWithAvatar>>>> {
    let characters = CharacterRepo::list_by_project_with_avatar(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: characters }))
}

/// GET /api/v1/projects/{project_id}/characters/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}
///
/// If the status is being changed to Active (2), the character must have a
/// non-empty `elevenlabs_voice` setting configured (VoiceID approval gate,
/// PRD-013 Amendment A.4).
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCharacter>,
) -> AppResult<Json<DataResponse<Character>>> {
    use x121_db::models::status::CharacterStatus;

    // VoiceID approval gate: block activation without a configured voice.
    if input.status_id == Some(CharacterStatus::Active.id()) {
        let settings = CharacterRepo::get_settings(&state.pool, id)
            .await?
            .unwrap_or_default();

        let has_voice = settings
            .get(SETTING_KEY_VOICE)
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.is_empty());

        if !has_voice {
            return Err(AppError::Core(CoreError::Validation(format!(
                "VoiceID ({SETTING_KEY_VOICE}) is required before activating a character"
            ))));
        }
    }

    let character = CharacterRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// DELETE /api/v1/projects/{project_id}/characters/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = CharacterRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Settings sub-resource
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/characters/{id}/settings
pub async fn get_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    let settings = CharacterRepo::get_settings(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Fully replaces the character's settings JSON.
pub async fn update_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(settings): Json<serde_json::Value>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::update_settings(&state.pool, id, &settings)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}

/// PATCH /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Shallow-merges the provided JSON keys into the existing settings
/// using PostgreSQL's `||` operator.
pub async fn patch_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(patch): Json<serde_json::Value>,
) -> AppResult<Json<DataResponse<Character>>> {
    let character = CharacterRepo::patch_settings(&state.pool, id, &patch)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}
