//! Handlers for the `/projects` resource.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::project::{CreateProject, Project, UpdateProject};
use trulience_db::repositories::ProjectRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/projects
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateProject>,
) -> AppResult<(StatusCode, Json<Project>)> {
    let project = ProjectRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(project)))
}

/// GET /api/v1/projects
pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<Project>>> {
    let projects = ProjectRepo::list(&state.pool).await?;
    Ok(Json(projects))
}

/// GET /api/v1/projects/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<Project>> {
    let project = ProjectRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(Json(project))
}

/// PUT /api/v1/projects/{id}
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateProject>,
) -> AppResult<Json<Project>> {
    let project = ProjectRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(Json(project))
}

/// DELETE /api/v1/projects/{id}
pub async fn delete(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode> {
    let deleted = ProjectRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))
    }
}
