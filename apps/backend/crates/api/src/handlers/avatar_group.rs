//! Handlers for the `/projects/{project_id}/groups` resource (PRD-112).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar::UpdateAvatar;
use x121_db::models::avatar_group::{
    AvatarGroup, CreateAvatarGroup, UpdateAvatarGroup,
};
use x121_db::repositories::{AvatarGroupRepo, AvatarRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/projects/{project_id}/groups
///
/// Overrides `input.project_id` with the URL path value.
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateAvatarGroup>,
) -> AppResult<(StatusCode, Json<DataResponse<AvatarGroup>>)> {
    input.project_id = project_id;
    let group = AvatarGroupRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: group })))
}

/// GET /api/v1/projects/{project_id}/groups
///
/// Auto-creates a default "Intake" group if the project has none.
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<AvatarGroup>>>> {
    // Ensure at least one group exists (auto-create "Intake" if empty)
    AvatarGroupRepo::ensure_default(&state.pool, project_id).await?;
    let groups = AvatarGroupRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: groups }))
}

/// PUT /api/v1/projects/{project_id}/groups/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateAvatarGroup>,
) -> AppResult<Json<DataResponse<AvatarGroup>>> {
    let group = AvatarGroupRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarGroup",
            id,
        }))?;
    Ok(Json(DataResponse { data: group }))
}

/// DELETE /api/v1/projects/{project_id}/groups/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = AvatarGroupRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarGroup",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Avatar-to-group assignment
// ---------------------------------------------------------------------------

/// Body for assigning a avatar to a group.
#[derive(Debug, Deserialize)]
pub struct AssignGroupBody {
    pub group_id: Option<DbId>,
}

/// PUT /api/v1/projects/{project_id}/avatars/{id}/group
///
/// Assign a avatar to a group, or remove from a group by setting `group_id: null`.
pub async fn assign_avatar_to_group(
    State(state): State<AppState>,
    Path((_project_id, avatar_id)): Path<(DbId, DbId)>,
    Json(body): Json<AssignGroupBody>,
) -> AppResult<Json<DataResponse<x121_db::models::avatar::Avatar>>> {
    let input = UpdateAvatar {
        name: None,
        status_id: None,
        metadata: None,
        settings: None,
        group_id: Some(body.group_id),
        blocking_deliverables: None,
    };
    let avatar = AvatarRepo::update(&state.pool, avatar_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: avatar_id,
        }))?;
    Ok(Json(DataResponse { data: avatar }))
}
