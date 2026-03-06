//! Handlers for the `/projects` resource.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::CharacterDeliverableRow;
use x121_db::models::project::{CreateProject, Project, UpdateProject};
use x121_db::repositories::{CharacterRepo, ProjectRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Verify a project exists, returning an `AppError::NotFound` if not.
///
/// Shared by `get_stats`, `get_character_deliverables`, and any future
/// project-scoped handlers in this file.
async fn ensure_project_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Project> {
    ProjectRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))
}

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
    let _project = ensure_project_exists(&state.pool, project_id).await?;

    // Character counts by status.
    // Statuses: 1=draft, 2=active (ready), 3=archived.
    // Archived characters (status_id = 3) are excluded from all counts
    // to prevent "ghost" tasks cluttering the PM's view.
    let char_stats: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status_id = 2) AS ready,
            COUNT(*) FILTER (WHERE status_id = 1) AS generating,
            0::bigint AS complete
         FROM characters
         WHERE project_id = $1 AND deleted_at IS NULL AND status_id != 3",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // Scene video version counts by QA approval status.
    // Join through scenes to reach characters for project filtering.
    // Excludes archived characters (status_id = 3).
    let scene_stats: (i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE svv.qa_status != 'pending') AS generated,
            COUNT(*) FILTER (WHERE svv.qa_status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE svv.qa_status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE svv.qa_status = 'pending') AS pending
         FROM scene_video_versions svv
         JOIN scenes s ON s.id = svv.scene_id
         JOIN characters c ON c.id = s.character_id
         WHERE c.project_id = $1 AND c.deleted_at IS NULL AND c.status_id != 3
           AND svv.deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    let delivery_readiness_pct = if scene_stats.0 > 0 {
        (scene_stats.2 as f64 / scene_stats.0 as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(DataResponse {
        data: ProjectStats {
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
        },
    }))
}

// ---------------------------------------------------------------------------
// Per-character deliverable status (Requirements gap: Stage 1.3)
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{id}/character-deliverables
///
/// Returns per-character deliverable status for the project overview grid.
pub async fn get_character_deliverables(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<CharacterDeliverableRow>>>> {
    // Verify project exists.
    let _project = ensure_project_exists(&state.pool, project_id).await?;

    let rows = CharacterRepo::list_deliverable_status(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: rows }))
}
