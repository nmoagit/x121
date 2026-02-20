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
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::character::{Character, CreateCharacter, UpdateCharacter};
use trulience_db::repositories::CharacterRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/projects/{project_id}/characters
///
/// Overrides `input.project_id` with the value from the URL path to ensure
/// the character is created under the correct project.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateCharacter>,
) -> AppResult<(StatusCode, Json<Character>)> {
    input.project_id = project_id;
    let character = CharacterRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(character)))
}

/// GET /api/v1/projects/{project_id}/characters
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<Character>>> {
    let characters = CharacterRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(characters))
}

/// GET /api/v1/projects/{project_id}/characters/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Character>> {
    let character = CharacterRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(character))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCharacter>,
) -> AppResult<Json<Character>> {
    let character = CharacterRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(character))
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
) -> AppResult<Json<serde_json::Value>> {
    let settings = CharacterRepo::get_settings(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(settings))
}

/// PUT /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Fully replaces the character's settings JSON.
pub async fn update_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(settings): Json<serde_json::Value>,
) -> AppResult<Json<Character>> {
    let character = CharacterRepo::update_settings(&state.pool, id, &settings)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(character))
}

/// PATCH /api/v1/projects/{project_id}/characters/{id}/settings
///
/// Shallow-merges the provided JSON keys into the existing settings
/// using PostgreSQL's `||` operator.
pub async fn patch_settings(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(patch): Json<serde_json::Value>,
) -> AppResult<Json<Character>> {
    let character = CharacterRepo::patch_settings(&state.pool, id, &patch)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;
    Ok(Json(character))
}
