//! Handlers for the `/projects` resource.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::project::{CreateProject, Project, UpdateProject};
use x121_db::repositories::ProjectRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/projects
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateProject>,
) -> AppResult<(StatusCode, Json<DataResponse<Project>>)> {
    let project = ProjectRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: project })))
}

/// GET /api/v1/projects
pub async fn list(State(state): State<AppState>) -> AppResult<Json<DataResponse<Vec<Project>>>> {
    let projects = ProjectRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: projects }))
}

/// GET /api/v1/projects/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Project>>> {
    let project = ProjectRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(Json(DataResponse { data: project }))
}

/// PUT /api/v1/projects/{id}
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateProject>,
) -> AppResult<Json<DataResponse<Project>>> {
    let project = ProjectRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(Json(DataResponse { data: project }))
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

// ---------------------------------------------------------------------------
// Project stats (PRD-112)
// ---------------------------------------------------------------------------

/// Aggregated project statistics.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectStats {
    pub character_count: i64,
    pub characters_ready: i64,
    pub characters_generating: i64,
    pub characters_complete: i64,
    pub scenes_enabled: i64,
    pub scenes_generated: i64,
    pub scenes_approved: i64,
    pub scenes_rejected: i64,
    pub scenes_pending: i64,
    pub delivery_readiness_pct: f64,
}

/// GET /api/v1/projects/{id}/stats
///
/// Returns aggregate statistics for a project.
pub async fn get_stats(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<ProjectStats>>> {
    // Verify project exists.
    let _project = ProjectRepo::find_by_id(&state.pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;

    // Character counts by status.
    let char_stats: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status_id = 3) AS ready,
            COUNT(*) FILTER (WHERE status_id = 4) AS generating,
            COUNT(*) FILTER (WHERE status_id = 5) AS complete
         FROM characters
         WHERE project_id = $1 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // Scene video version counts by approval status.
    let scene_stats: (i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) AS enabled,
            COUNT(*) FILTER (WHERE svv.status_id >= 2) AS generated,
            COUNT(*) FILTER (WHERE svv.status_id = 3) AS approved,
            COUNT(*) FILTER (WHERE svv.status_id = 4) AS rejected,
            COUNT(*) FILTER (WHERE svv.status_id = 1) AS pending
         FROM scene_video_versions svv
         JOIN characters c ON c.id = svv.character_id
         WHERE c.project_id = $1 AND c.deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    let delivery_readiness_pct = if scene_stats.0 > 0 {
        (scene_stats.2 as f64 / scene_stats.0 as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(DataResponse { data: ProjectStats {
        character_count: char_stats.0,
        characters_ready: char_stats.1,
        characters_generating: char_stats.2,
        characters_complete: char_stats.3,
        scenes_enabled: scene_stats.0,
        scenes_generated: scene_stats.1,
        scenes_approved: scene_stats.2,
        scenes_rejected: scene_stats.3,
        scenes_pending: scene_stats.4,
        delivery_readiness_pct,
    }}))
}
