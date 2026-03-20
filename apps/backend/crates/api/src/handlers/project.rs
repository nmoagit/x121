//! Handlers for the `/projects` resource.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::character::CharacterDeliverableRow;
use x121_db::models::project::{CreateProject, Project, UpdateProject};
use x121_db::repositories::character_speech_repo::ProjectLanguageCount;
use x121_db::repositories::{CharacterRepo, CharacterSpeechRepo, ProjectRepo};

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

/// Enriched project for list views — includes inline character counts.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectWithCounts {
    #[serde(flatten)]
    pub project: Project,
    pub character_count: i64,
    pub characters_ready: i64,
}

/// GET /api/v1/projects
pub async fn list(State(state): State<AppState>) -> AppResult<Json<DataResponse<Vec<ProjectWithCounts>>>> {
    let projects = ProjectRepo::list(&state.pool).await?;

    // Single query: character counts per project (non-archived, non-deleted).
    let counts: Vec<(DbId, i64)> = sqlx::query_as(
        "SELECT project_id, COUNT(*)
         FROM characters
         WHERE deleted_at IS NULL AND status_id != 3
         GROUP BY project_id",
    )
    .fetch_all(&state.pool)
    .await?;

    // Single query: ready character counts from readiness cache per project.
    let ready_counts: Vec<(DbId, i64)> = sqlx::query_as(
        "SELECT c.project_id, COUNT(*)
         FROM character_readiness_cache crc
         JOIN characters c ON c.id = crc.character_id
         WHERE crc.state = 'ready' AND c.deleted_at IS NULL AND c.status_id != 3
         GROUP BY c.project_id",
    )
    .fetch_all(&state.pool)
    .await?;

    let count_map: std::collections::HashMap<DbId, i64> = counts.into_iter().collect();
    let ready_map: std::collections::HashMap<DbId, i64> = ready_counts.into_iter().collect();

    let enriched: Vec<ProjectWithCounts> = projects
        .into_iter()
        .map(|p| {
            let id = p.id;
            ProjectWithCounts {
                project: p,
                character_count: count_map.get(&id).copied().unwrap_or(0),
                characters_ready: ready_map.get(&id).copied().unwrap_or(0),
            }
        })
        .collect();

    Ok(Json(DataResponse { data: enriched }))
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
    pub characters_draft: i64,
    pub characters_active: i64,
    /// Characters with readiness state 'ready' in the cache.
    pub characters_ready: i64,
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
    // Statuses: 1=draft, 2=active, 3=archived.
    // Archived characters (status_id = 3) are excluded from all counts.
    let char_stats: (i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status_id = 1) AS draft,
            COUNT(*) FILTER (WHERE status_id = 2) AS active
         FROM characters
         WHERE project_id = $1 AND deleted_at IS NULL AND status_id != 3",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // Ready characters from the readiness cache.
    let characters_ready: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)
         FROM character_readiness_cache crc
         JOIN characters c ON c.id = crc.character_id
         WHERE crc.state = 'ready' AND c.project_id = $1
           AND c.deleted_at IS NULL AND c.status_id != 3",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // scenes_enabled: count of enabled scene+track combos for this project,
    // using the same logic as the project scene settings endpoint.
    let scenes_enabled: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)
         FROM scene_types st
         JOIN scene_type_tracks stt ON stt.scene_type_id = st.id
         JOIN tracks t ON t.id = stt.track_id AND t.is_active = true
         LEFT JOIN project_scene_settings pss
             ON pss.scene_type_id = st.id AND pss.track_id = t.id
                AND pss.project_id = $1
         WHERE st.is_active = true AND st.deleted_at IS NULL
           AND COALESCE(pss.is_enabled, st.is_active)",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // Scene video version counts: how many scenes across all models have
    // been generated / approved / rejected / are pending.
    let scene_stats: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) FILTER (WHERE svv.qa_status != 'pending') AS generated,
            COUNT(*) FILTER (WHERE svv.qa_status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE svv.qa_status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE svv.qa_status = 'pending') AS pending
         FROM scene_video_versions svv
         JOIN scenes s ON s.id = svv.scene_id
         JOIN characters c ON c.id = s.character_id
         WHERE c.project_id = $1 AND c.deleted_at IS NULL AND c.status_id != 3
           AND svv.deleted_at IS NULL AND svv.is_final = true",
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?;

    // Delivery readiness = percentage of models that are ready.
    let delivery_readiness_pct = if char_stats.0 > 0 {
        (characters_ready.0 as f64 / char_stats.0 as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(DataResponse {
        data: ProjectStats {
            character_count: char_stats.0,
            characters_draft: char_stats.1,
            characters_active: char_stats.2,
            characters_ready: characters_ready.0,
            scenes_enabled: scenes_enabled.0,
            scenes_generated: scene_stats.0,
            scenes_approved: scene_stats.1,
            scenes_rejected: scene_stats.2,
            scenes_pending: scene_stats.3,
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

// ---------------------------------------------------------------------------
// Batch scene assignments for the deliverables matrix
// ---------------------------------------------------------------------------

/// A scene assignment row for batch responses — mirrors the per-character
/// dashboard `SceneAssignment` but includes `character_id` and fields needed
/// for building matrix columns (scene_name, track_name, etc.).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BatchSceneAssignment {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub scene_name: String,
    pub track_id: DbId,
    pub track_name: String,
    pub track_slug: String,
    pub has_clothes_off_transition: bool,
    pub scene_id: Option<DbId>,
    pub status: String,
    pub segment_count: i64,
    pub final_video_count: i64,
}

// ---------------------------------------------------------------------------
// Batch image variant statuses for the deliverables matrix
// ---------------------------------------------------------------------------

/// Lightweight image variant projection for the deliverables matrix.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BatchVariantStatus {
    pub character_id: DbId,
    pub id: DbId,
    pub variant_type: Option<String>,
    pub status_id: i16,
    pub is_hero: bool,
}

/// GET /api/v1/projects/{id}/variant-statuses
///
/// Returns a lightweight projection of all image variants for characters in a project.
/// Used by the deliverables matrix to avoid N individual image-variant calls.
pub async fn get_batch_variant_statuses(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<BatchVariantStatus>>>> {
    let _project = ensure_project_exists(&state.pool, project_id).await?;

    let rows = sqlx::query_as::<_, BatchVariantStatus>(
        "SELECT iv.character_id, iv.id, iv.variant_type, iv.status_id, iv.is_hero
         FROM image_variants iv
         JOIN characters c ON c.id = iv.character_id
         WHERE c.project_id = $1 AND c.deleted_at IS NULL AND iv.deleted_at IS NULL
         ORDER BY iv.character_id, iv.id",
    )
    .bind(project_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(DataResponse { data: rows }))
}

// ---------------------------------------------------------------------------
// Batch scene assignments for the deliverables matrix
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{id}/scene-assignments
///
/// Returns scene assignments for ALL characters in a project in one query,
/// using the same 4-level inheritance (scene_type defaults → project settings
/// → group settings → character overrides) as the per-character dashboard.
/// Includes enabled combos without scene records (status = 'not_started').
pub async fn get_batch_scene_assignments(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<BatchSceneAssignment>>>> {
    let _project = ensure_project_exists(&state.pool, project_id).await?;

    let rows = sqlx::query_as::<_, BatchSceneAssignment>(
        "SELECT
            c.id AS character_id,
            st.id AS scene_type_id,
            st.name AS scene_name,
            t.id AS track_id,
            t.name AS track_name,
            t.slug AS track_slug,
            st.has_clothes_off_transition,
            sc.id AS scene_id,
            CASE
                WHEN sc.id IS NULL THEN 'not_started'
                WHEN fc.qa_status = 'approved' THEN 'approved'
                WHEN fc.qa_status = 'rejected' THEN 'rejected'
                WHEN fc.source IS NOT NULL THEN fc.source
                WHEN ss.name = 'generating' THEN 'generating'
                ELSE COALESCE(ss.name, 'not_started')
            END AS status,
            COALESCE((SELECT COUNT(*) FROM scene_video_versions svv
             WHERE svv.scene_id = sc.id AND svv.deleted_at IS NULL AND svv.is_final = false), 0) AS segment_count,
            COALESCE((SELECT COUNT(*) FROM scene_video_versions svv
             WHERE svv.scene_id = sc.id AND svv.deleted_at IS NULL), 0) AS final_video_count
        FROM characters c
        CROSS JOIN scene_types st
        CROSS JOIN tracks t
        LEFT JOIN project_scene_settings pss
            ON pss.scene_type_id = st.id AND (pss.track_id = t.id OR pss.track_id IS NULL)
               AND pss.project_id = $1
        LEFT JOIN group_scene_settings gss
            ON gss.scene_type_id = st.id AND (gss.track_id = t.id OR gss.track_id IS NULL)
               AND gss.group_id = c.group_id
        LEFT JOIN character_scene_overrides cso
            ON cso.scene_type_id = st.id AND (cso.track_id = t.id OR cso.track_id IS NULL)
               AND cso.character_id = c.id
        LEFT JOIN scenes sc
            ON sc.scene_type_id = st.id AND sc.track_id = t.id
               AND sc.character_id = c.id AND sc.deleted_at IS NULL
        LEFT JOIN scene_statuses ss ON ss.id = sc.status_id
        LEFT JOIN LATERAL (
            SELECT svv.qa_status, svv.source
            FROM scene_video_versions svv
            WHERE svv.scene_id = sc.id AND svv.is_final = true AND svv.deleted_at IS NULL
            ORDER BY svv.id DESC
            LIMIT 1
        ) fc ON true
        WHERE c.project_id = $1 AND c.deleted_at IS NULL
          AND st.is_active = true AND st.deleted_at IS NULL
          AND COALESCE(cso.is_enabled, gss.is_enabled, pss.is_enabled, st.is_active)
        ORDER BY c.id, st.name, t.name",
    )
    .bind(project_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(DataResponse { data: rows }))
}

// ---------------------------------------------------------------------------
// Batch speech language counts for character cards
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{id}/speech-language-counts
///
/// Returns speech count per language per character for the project character grid.
pub async fn get_speech_language_counts(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<ProjectLanguageCount>>>> {
    let _project = ensure_project_exists(&state.pool, project_id).await?;

    let rows = CharacterSpeechRepo::count_by_language_for_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: rows }))
}
