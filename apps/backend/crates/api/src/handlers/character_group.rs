//! Handlers for the `/projects/{project_id}/groups` resource (PRD-112).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::UpdateCharacter;
use x121_db::models::character_group::{
    CharacterGroup, CreateCharacterGroup, UpdateCharacterGroup,
};
use x121_db::repositories::{CharacterGroupRepo, CharacterRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/projects/{project_id}/groups
///
/// Overrides `input.project_id` with the URL path value.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateCharacterGroup>,
) -> AppResult<(StatusCode, Json<DataResponse<CharacterGroup>>)> {
    input.project_id = project_id;
    let group = CharacterGroupRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: group })))
}

/// GET /api/v1/projects/{project_id}/groups
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CharacterGroup>>>> {
    let groups = CharacterGroupRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: groups }))
}

/// PUT /api/v1/projects/{project_id}/groups/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCharacterGroup>,
) -> AppResult<Json<DataResponse<CharacterGroup>>> {
    let group = CharacterGroupRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "CharacterGroup",
            id,
        }))?;
    Ok(Json(DataResponse { data: group }))
}

/// DELETE /api/v1/projects/{project_id}/groups/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = CharacterGroupRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "CharacterGroup",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Character-to-group assignment
// ---------------------------------------------------------------------------

/// Body for assigning a character to a group.
#[derive(Debug, Deserialize)]
pub struct AssignGroupBody {
    pub group_id: Option<DbId>,
}

/// PUT /api/v1/projects/{project_id}/characters/{id}/group
///
/// Assign a character to a group, or remove from a group by setting `group_id: null`.
pub async fn assign_character_to_group(
    State(state): State<AppState>,
    Path((_project_id, character_id)): Path<(DbId, DbId)>,
    Json(body): Json<AssignGroupBody>,
) -> AppResult<Json<DataResponse<x121_db::models::character::Character>>> {
    let input = UpdateCharacter {
        name: None,
        status_id: None,
        metadata: None,
        settings: None,
        group_id: Some(body.group_id),
    };
    let character = CharacterRepo::update(&state.pool, character_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;
    Ok(Json(DataResponse { data: character }))
}
