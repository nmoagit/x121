//! Repository for `temporal_metrics` and `temporal_settings` tables (PRD-26).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::temporal_metric::{
    CreateTemporalMetric, CreateTemporalSetting, TemporalMetric, TemporalSetting,
    TemporalTrendPoint,
};

/// Column list for `temporal_metrics` SELECT queries.
const METRIC_COLUMNS: &str = "\
    id, segment_id, drift_score, centering_offset_x, centering_offset_y, \
    grain_variance, grain_match_score, subject_bbox, analysis_version, \
    created_at, updated_at";

/// Column list for `temporal_settings` SELECT queries.
const SETTING_COLUMNS: &str = "\
    id, project_id, scene_type_id, drift_threshold, grain_threshold, \
    centering_threshold, auto_flag_enabled, created_at, updated_at";

/// Provides query operations for temporal metrics.
pub struct TemporalMetricRepo;

impl TemporalMetricRepo {
    // -----------------------------------------------------------------------
    // temporal_metrics CRUD
    // -----------------------------------------------------------------------

    /// Insert a new temporal metric record.
    pub async fn create(
        pool: &PgPool,
        input: &CreateTemporalMetric,
    ) -> Result<TemporalMetric, sqlx::Error> {
        let version = input.analysis_version.as_deref().unwrap_or("v1");
        let query = format!(
            "INSERT INTO temporal_metrics \
                (segment_id, drift_score, centering_offset_x, centering_offset_y, \
                 grain_variance, grain_match_score, subject_bbox, analysis_version) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {METRIC_COLUMNS}"
        );
        sqlx::query_as::<_, TemporalMetric>(&query)
            .bind(input.segment_id)
            .bind(input.drift_score)
            .bind(input.centering_offset_x)
            .bind(input.centering_offset_y)
            .bind(input.grain_variance)
            .bind(input.grain_match_score)
            .bind(&input.subject_bbox)
            .bind(version)
            .fetch_one(pool)
            .await
    }

    /// Upsert a temporal metric (insert or update on conflict of segment + version).
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateTemporalMetric,
    ) -> Result<TemporalMetric, sqlx::Error> {
        let version = input.analysis_version.as_deref().unwrap_or("v1");
        let query = format!(
            "INSERT INTO temporal_metrics \
                (segment_id, drift_score, centering_offset_x, centering_offset_y, \
                 grain_variance, grain_match_score, subject_bbox, analysis_version) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             ON CONFLICT (segment_id, analysis_version) DO UPDATE SET \
                drift_score = EXCLUDED.drift_score, \
                centering_offset_x = EXCLUDED.centering_offset_x, \
                centering_offset_y = EXCLUDED.centering_offset_y, \
                grain_variance = EXCLUDED.grain_variance, \
                grain_match_score = EXCLUDED.grain_match_score, \
                subject_bbox = EXCLUDED.subject_bbox, \
                updated_at = now() \
             RETURNING {METRIC_COLUMNS}"
        );
        sqlx::query_as::<_, TemporalMetric>(&query)
            .bind(input.segment_id)
            .bind(input.drift_score)
            .bind(input.centering_offset_x)
            .bind(input.centering_offset_y)
            .bind(input.grain_variance)
            .bind(input.grain_match_score)
            .bind(&input.subject_bbox)
            .bind(version)
            .fetch_one(pool)
            .await
    }

    /// Find a temporal metric for a specific segment (latest version).
    pub async fn find_by_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Option<TemporalMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {METRIC_COLUMNS} FROM temporal_metrics \
             WHERE segment_id = $1 \
             ORDER BY updated_at DESC \
             LIMIT 1"
        );
        sqlx::query_as::<_, TemporalMetric>(&query)
            .bind(segment_id)
            .fetch_optional(pool)
            .await
    }

    /// List all temporal metrics for segments belonging to a given scene.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<TemporalMetric>, sqlx::Error> {
        let query = "\
            SELECT tm.id, tm.segment_id, tm.drift_score, \
                   tm.centering_offset_x, tm.centering_offset_y, \
                   tm.grain_variance, tm.grain_match_score, \
                   tm.subject_bbox, tm.analysis_version, \
                   tm.created_at, tm.updated_at \
            FROM temporal_metrics tm \
            INNER JOIN segments s ON s.id = tm.segment_id \
            WHERE s.scene_id = $1 \
            ORDER BY s.sequence_index ASC, tm.updated_at DESC";
        sqlx::query_as::<_, TemporalMetric>(query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Get trend data (compact) for all segments in a scene, ordered by sort_order.
    pub async fn get_trend_data(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<TemporalTrendPoint>, sqlx::Error> {
        let query = "\
            SELECT tm.segment_id, tm.drift_score, \
                   tm.centering_offset_x, tm.centering_offset_y, \
                   tm.grain_match_score \
            FROM temporal_metrics tm \
            INNER JOIN segments s ON s.id = tm.segment_id \
            WHERE s.scene_id = $1 \
            ORDER BY s.sequence_index ASC";
        sqlx::query_as::<_, TemporalTrendPoint>(query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }
}

/// Provides query operations for temporal settings.
pub struct TemporalSettingRepo;

impl TemporalSettingRepo {
    /// Get settings for a project, optionally filtered by scene type.
    pub async fn get_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<TemporalSetting>, sqlx::Error> {
        let query = format!(
            "SELECT {SETTING_COLUMNS} FROM temporal_settings \
             WHERE project_id = $1 \
             ORDER BY scene_type_id ASC NULLS FIRST"
        );
        sqlx::query_as::<_, TemporalSetting>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Upsert settings for a project + optional scene type.
    pub async fn upsert(
        pool: &PgPool,
        project_id: DbId,
        input: &CreateTemporalSetting,
    ) -> Result<TemporalSetting, sqlx::Error> {
        let query = format!(
            "INSERT INTO temporal_settings \
                (project_id, scene_type_id, drift_threshold, grain_threshold, \
                 centering_threshold, auto_flag_enabled) \
             VALUES ($1, $2, \
                     COALESCE($3, 0.15), COALESCE($4, 0.80), \
                     COALESCE($5, 30.0), COALESCE($6, true)) \
             ON CONFLICT (project_id, scene_type_id) DO UPDATE SET \
                drift_threshold = COALESCE(EXCLUDED.drift_threshold, temporal_settings.drift_threshold), \
                grain_threshold = COALESCE(EXCLUDED.grain_threshold, temporal_settings.grain_threshold), \
                centering_threshold = COALESCE(EXCLUDED.centering_threshold, temporal_settings.centering_threshold), \
                auto_flag_enabled = COALESCE(EXCLUDED.auto_flag_enabled, temporal_settings.auto_flag_enabled), \
                updated_at = now() \
             RETURNING {SETTING_COLUMNS}"
        );
        sqlx::query_as::<_, TemporalSetting>(&query)
            .bind(project_id)
            .bind(input.scene_type_id)
            .bind(input.drift_threshold)
            .bind(input.grain_threshold)
            .bind(input.centering_threshold)
            .bind(input.auto_flag_enabled)
            .fetch_one(pool)
            .await
    }
}
