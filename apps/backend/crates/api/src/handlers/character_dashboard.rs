//! Handlers for the character settings dashboard (PRD-108).
//!
//! Provides a unified dashboard endpoint that aggregates character data
//! from multiple tables, and a PATCH endpoint for partially updating
//! character settings JSONB.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;

use x121_core::character_dashboard::validate_settings_update;
use x121_core::types::DbId;
use x121_db::repositories::ReadinessCacheRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Dashboard response types (local to the handler, not in core/db)
// ---------------------------------------------------------------------------

/// Aggregated dashboard data returned by `GET /characters/{id}/dashboard`.
#[derive(Debug, serde::Serialize)]
pub struct CharacterDashboardData {
    pub character_id: DbId,
    pub character_name: String,
    pub project_id: DbId,
    pub source_image_count: i64,
    pub variant_counts: VariantCounts,
    pub settings: serde_json::Value,
    pub readiness: Option<ReadinessSnapshot>,
    pub scene_count: i64,
    pub generation_summary: GenerationSummary,
}

/// Image variant counts grouped by status.
#[derive(Debug, serde::Serialize)]
pub struct VariantCounts {
    pub total: i64,
    pub approved: i64,
    pub rejected: i64,
    pub pending: i64,
}

/// Snapshot of the readiness cache for inclusion in the dashboard.
#[derive(Debug, serde::Serialize)]
pub struct ReadinessSnapshot {
    pub state: String,
    pub missing_items: serde_json::Value,
    pub readiness_pct: i32,
}

/// Summary of segment generation statuses across all scenes.
#[derive(Debug, serde::Serialize)]
pub struct GenerationSummary {
    pub total_segments: i64,
    pub approved: i64,
    pub rejected: i64,
    pub pending: i64,
}

// ---------------------------------------------------------------------------
// Row types for aggregate queries (used by sqlx::query_as)
// ---------------------------------------------------------------------------

#[derive(Debug, sqlx::FromRow)]
struct CharacterRow {
    id: DbId,
    name: String,
    project_id: DbId,
    settings: Option<serde_json::Value>,
}

#[derive(Debug, sqlx::FromRow)]
struct CountRow {
    count: Option<i64>,
}

#[derive(Debug, sqlx::FromRow)]
struct VariantCountsRow {
    total: Option<i64>,
    approved: Option<i64>,
    rejected: Option<i64>,
    pending: Option<i64>,
}

#[derive(Debug, sqlx::FromRow)]
struct SegmentCountsRow {
    total: Option<i64>,
    approved: Option<i64>,
    rejected: Option<i64>,
    pending: Option<i64>,
}

#[derive(Debug, sqlx::FromRow)]
struct SettingsRow {
    settings: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /characters/{id}/dashboard
///
/// Returns aggregated dashboard data for a single character including:
/// - Character info (name, project)
/// - Source image count
/// - Image variant counts by status
/// - Current pipeline settings
/// - Readiness result from cache
/// - Scene count
/// - Generation summary (segment statuses)
pub async fn get_dashboard(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Fetch character record.
    let character = sqlx::query_as::<_, CharacterRow>(
        "SELECT id, name, project_id, settings FROM characters WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(character_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| {
        AppError::Core(x121_core::error::CoreError::NotFound {
            entity: "Character",
            id: character_id,
        })
    })?;

    // Source image count.
    let source_count_row = sqlx::query_as::<_, CountRow>(
        "SELECT COUNT(*) AS count FROM source_images WHERE character_id = $1 AND deleted_at IS NULL",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    // Image variant counts by status.
    let variant_counts_row = sqlx::query_as::<_, VariantCountsRow>(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending
         FROM image_variants
         WHERE character_id = $1 AND deleted_at IS NULL",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    // Readiness from cache.
    let readiness_cache =
        ReadinessCacheRepo::find_by_character_id(&state.pool, character_id).await?;

    let readiness = readiness_cache.map(|c| ReadinessSnapshot {
        state: c.state,
        missing_items: c.missing_items,
        readiness_pct: c.readiness_pct,
    });

    // Scene count for this character.
    let scene_count_row = sqlx::query_as::<_, CountRow>(
        "SELECT COUNT(*) AS count FROM scenes WHERE character_id = $1 AND deleted_at IS NULL",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    // Segment generation summary across all scenes for this character.
    let segment_counts_row = sqlx::query_as::<_, SegmentCountsRow>(
        "SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE seg.status = 'approved') AS approved,
            COUNT(*) FILTER (WHERE seg.status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE seg.status = 'pending') AS pending
         FROM segments seg
         JOIN scenes sc ON sc.id = seg.scene_id
         WHERE sc.character_id = $1 AND sc.deleted_at IS NULL",
    )
    .bind(character_id)
    .fetch_one(&state.pool)
    .await?;

    let dashboard = CharacterDashboardData {
        character_id: character.id,
        character_name: character.name,
        project_id: character.project_id,
        source_image_count: source_count_row.count.unwrap_or(0),
        variant_counts: VariantCounts {
            total: variant_counts_row.total.unwrap_or(0),
            approved: variant_counts_row.approved.unwrap_or(0),
            rejected: variant_counts_row.rejected.unwrap_or(0),
            pending: variant_counts_row.pending.unwrap_or(0),
        },
        settings: character.settings.unwrap_or(serde_json::json!({})),
        readiness,
        scene_count: scene_count_row.count.unwrap_or(0),
        generation_summary: GenerationSummary {
            total_segments: segment_counts_row.total.unwrap_or(0),
            approved: segment_counts_row.approved.unwrap_or(0),
            rejected: segment_counts_row.rejected.unwrap_or(0),
            pending: segment_counts_row.pending.unwrap_or(0),
        },
    };

    Ok(Json(DataResponse { data: dashboard }))
}

/// PATCH /characters/{id}/settings
///
/// Partially update a character's settings JSONB using PostgreSQL `||`
/// operator (merge, not replace). After update, invalidate the readiness
/// cache for the character.
pub async fn patch_settings(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(updates): Json<serde_json::Value>,
) -> AppResult<impl IntoResponse> {
    // Validate the payload is a non-null JSON object.
    validate_settings_update(&updates).map_err(AppError::BadRequest)?;

    // Merge settings using PostgreSQL || operator.
    let row = sqlx::query_as::<_, SettingsRow>(
        "UPDATE characters
         SET settings = COALESCE(settings, '{}'::jsonb) || $1,
             updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING settings",
    )
    .bind(&updates)
    .bind(character_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| {
        AppError::Core(x121_core::error::CoreError::NotFound {
            entity: "Character",
            id: character_id,
        })
    })?;

    // Invalidate readiness cache so it gets recomputed on next read.
    let _ = ReadinessCacheRepo::delete_by_character_id(&state.pool, character_id).await;

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        "Character settings patched"
    );

    let settings = row.settings.unwrap_or(serde_json::json!({}));
    Ok(Json(DataResponse { data: settings }))
}
