//! Handlers for cross-character scene comparison (PRD-68).
//!
//! Read-only endpoints for comparing scenes across characters within a project.
//! No new database tables are required -- all data comes from existing tables.
//!
//! Endpoints:
//! - `GET /projects/{project_id}/scene-comparison` -- compare all characters for a scene type
//! - `GET /projects/{project_id}/characters/{character_id}/all-scenes` -- all scenes for one character

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use x121_core::error::CoreError;
use x121_core::types::{DbId, Timestamp};
use x121_db::repositories::{CharacterRepo, ProjectRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::scene_type_inheritance::ensure_scene_type_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// A single cell in the comparison gallery.
#[derive(Debug, Serialize)]
pub struct ComparisonCell {
    pub character_id: DbId,
    pub character_name: String,
    pub scene_id: DbId,
    pub segment_id: Option<DbId>,
    pub scene_type_id: DbId,
    pub scene_type_name: String,
    pub image_variant_id: DbId,
    pub status_id: i16,
    pub thumbnail_url: Option<String>,
    pub stream_url: Option<String>,
    pub qa_score: Option<f64>,
    pub approval_status: Option<String>,
    pub duration_secs: Option<f64>,
    pub created_at: Timestamp,
}

/// Response for the scene comparison endpoint.
#[derive(Debug, Serialize)]
pub struct ComparisonResponse {
    pub scene_type_id: DbId,
    pub scene_type_name: String,
    pub cells: Vec<ComparisonCell>,
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for `GET /projects/{project_id}/scene-comparison`.
#[derive(Debug, Deserialize)]
pub struct SceneComparisonParams {
    /// The scene type to compare across characters.
    pub scene_type_id: DbId,
    /// Optional image variant filter.
    pub variant_id: Option<DbId>,
    /// Optional approval status filter (`approved`, `rejected`, `flagged`).
    pub status: Option<String>,
}

// ---------------------------------------------------------------------------
// Row types for SQL queries
// ---------------------------------------------------------------------------

/// Row returned by the comparison query.
#[derive(Debug, sqlx::FromRow)]
struct ComparisonRow {
    character_id: DbId,
    character_name: String,
    scene_id: DbId,
    scene_type_id: DbId,
    scene_type_name: String,
    image_variant_id: DbId,
    status_id: i16,
    segment_id: Option<DbId>,
    quality_scores: Option<serde_json::Value>,
    duration_secs: Option<f64>,
    segment_created_at: Option<Timestamp>,
    approval_status: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract a numeric QA score from the `quality_scores` JSONB.
///
/// Looks for a top-level `"overall"` key first, then falls back to the
/// average of all numeric values in the object.
fn extract_qa_score(scores: &Option<serde_json::Value>) -> Option<f64> {
    let obj = scores.as_ref()?.as_object()?;

    // Try "overall" key first.
    if let Some(val) = obj.get("overall").and_then(|v| v.as_f64()) {
        return Some(val);
    }

    // Fall back to averaging all numeric values.
    let nums: Vec<f64> = obj.values().filter_map(|v| v.as_f64()).collect();
    if nums.is_empty() {
        return None;
    }
    Some(nums.iter().sum::<f64>() / nums.len() as f64)
}

/// Build thumbnail URL for a segment.
fn thumbnail_url(segment_id: DbId) -> String {
    format!("/api/v1/videos/segment/{segment_id}/thumbnails/0")
}

/// Build stream URL for a segment.
fn stream_url(segment_id: DbId) -> String {
    format!("/api/v1/videos/segment/{segment_id}/stream")
}

/// Convert a [`ComparisonRow`] into a [`ComparisonCell`].
fn row_to_cell(row: ComparisonRow) -> ComparisonCell {
    let qa_score = extract_qa_score(&row.quality_scores);
    let (thumb, stream) = match row.segment_id {
        Some(sid) => (Some(thumbnail_url(sid)), Some(stream_url(sid))),
        None => (None, None),
    };

    ComparisonCell {
        character_id: row.character_id,
        character_name: row.character_name,
        scene_id: row.scene_id,
        segment_id: row.segment_id,
        scene_type_id: row.scene_type_id,
        scene_type_name: row.scene_type_name,
        image_variant_id: row.image_variant_id,
        status_id: row.status_id,
        thumbnail_url: thumb,
        stream_url: stream,
        qa_score,
        approval_status: row.approval_status,
        duration_secs: row.duration_secs,
        created_at: row.segment_created_at.unwrap_or(chrono::Utc::now()),
    }
}

/// Verify that a project exists (not soft-deleted).
async fn ensure_project_exists(pool: &x121_db::DbPool, project_id: DbId) -> AppResult<()> {
    ProjectRepo::find_by_id(pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;
    Ok(())
}

/// Verify that a character exists, belongs to the given project, and is not deleted.
async fn ensure_character_in_project(
    pool: &x121_db::DbPool,
    character_id: DbId,
    project_id: DbId,
) -> AppResult<()> {
    let character = CharacterRepo::find_by_id(pool, character_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }))?;
    if character.project_id != project_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id: character_id,
        }));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /projects/{project_id}/scene-comparison?scene_type_id=N&variant_id=N&status=approved
///
/// Returns all characters' latest segments for a given scene type within a
/// project, enabling side-by-side comparison in the gallery UI.
pub async fn scene_comparison(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(params): Query<SceneComparisonParams>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, project_id).await?;
    let _ = ensure_scene_type_exists(&state.pool, params.scene_type_id).await?;

    let rows = fetch_comparison_rows(&state.pool, project_id, &params).await?;

    // Resolve the scene type name from the first row, or query it directly.
    let scene_type_name = rows
        .first()
        .map(|r| r.scene_type_name.clone())
        .unwrap_or_default();

    let mut cells: Vec<ComparisonCell> = rows.into_iter().map(row_to_cell).collect();

    // Apply approval status filter client-side (post-query) if requested.
    if let Some(ref filter_status) = params.status {
        cells.retain(|c| {
            c.approval_status
                .as_deref()
                .map(|s| s == filter_status.as_str())
                .unwrap_or(false)
        });
    }

    let response = ComparisonResponse {
        scene_type_id: params.scene_type_id,
        scene_type_name,
        cells,
    };

    Ok(Json(DataResponse { data: response }))
}

/// GET /projects/{project_id}/characters/{character_id}/all-scenes
///
/// Returns all scene types for a single character, with their latest segment
/// data for the inverse comparison view.
pub async fn character_all_scenes(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((project_id, character_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, project_id).await?;
    ensure_character_in_project(&state.pool, character_id, project_id).await?;

    let rows = fetch_character_scenes(&state.pool, character_id).await?;
    let cells: Vec<ComparisonCell> = rows.into_iter().map(row_to_cell).collect();

    Ok(Json(DataResponse { data: cells }))
}

// ---------------------------------------------------------------------------
// SQL queries
// ---------------------------------------------------------------------------

/// Fetch comparison rows for all characters in a project for a given scene type.
///
/// Uses a `LEFT JOIN LATERAL` to efficiently select only the latest segment
/// per scene (by highest `sequence_index`).
async fn fetch_comparison_rows(
    pool: &x121_db::DbPool,
    project_id: DbId,
    params: &SceneComparisonParams,
) -> AppResult<Vec<ComparisonRow>> {
    let variant_clause = if params.variant_id.is_some() {
        "AND sc.image_variant_id = $3"
    } else {
        ""
    };

    let sql = format!(
        "SELECT
            c.id AS character_id,
            c.name AS character_name,
            sc.id AS scene_id,
            sc.scene_type_id,
            st.name AS scene_type_name,
            sc.image_variant_id,
            sc.status_id,
            seg.id AS segment_id,
            seg.quality_scores,
            seg.duration_secs,
            seg.created_at AS segment_created_at,
            (
                SELECT sa.decision
                FROM segment_approvals sa
                WHERE sa.segment_id = seg.id
                ORDER BY sa.decided_at DESC NULLS LAST
                LIMIT 1
            ) AS approval_status
        FROM scenes sc
        JOIN characters c ON c.id = sc.character_id
        JOIN scene_types st ON st.id = sc.scene_type_id
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM segments s
            WHERE s.scene_id = sc.id AND s.deleted_at IS NULL
            ORDER BY s.sequence_index DESC
            LIMIT 1
        ) seg ON true
        WHERE c.project_id = $1
          AND sc.scene_type_id = $2
          {variant_clause}
          AND sc.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.name ASC"
    );

    let mut query = sqlx::query_as::<_, ComparisonRow>(&sql)
        .bind(project_id)
        .bind(params.scene_type_id);

    if let Some(variant_id) = params.variant_id {
        query = query.bind(variant_id);
    }

    let rows = query.fetch_all(pool).await?;
    Ok(rows)
}

/// Fetch all scenes for a single character with their latest segment data.
async fn fetch_character_scenes(
    pool: &x121_db::DbPool,
    character_id: DbId,
) -> AppResult<Vec<ComparisonRow>> {
    let rows = sqlx::query_as::<_, ComparisonRow>(
        "SELECT
            c.id AS character_id,
            c.name AS character_name,
            sc.id AS scene_id,
            sc.scene_type_id,
            st.name AS scene_type_name,
            sc.image_variant_id,
            sc.status_id,
            seg.id AS segment_id,
            seg.quality_scores,
            seg.duration_secs,
            seg.created_at AS segment_created_at,
            (
                SELECT sa.decision
                FROM segment_approvals sa
                WHERE sa.segment_id = seg.id
                ORDER BY sa.decided_at DESC NULLS LAST
                LIMIT 1
            ) AS approval_status
        FROM scenes sc
        JOIN characters c ON c.id = sc.character_id
        JOIN scene_types st ON st.id = sc.scene_type_id
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM segments s
            WHERE s.scene_id = sc.id AND s.deleted_at IS NULL
            ORDER BY s.sequence_index DESC
            LIMIT 1
        ) seg ON true
        WHERE sc.character_id = $1
          AND sc.deleted_at IS NULL
        ORDER BY st.name ASC",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
