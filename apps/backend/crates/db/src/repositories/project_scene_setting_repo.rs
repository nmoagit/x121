//! Repository for the `project_scene_settings` table (PRD-111, PRD-123).
//!
//! Second tier of the four-level inheritance chain:
//! scene_type defaults -> project settings -> group settings -> avatar overrides.
//!
//! Settings are keyed on `(project_id, scene_type_id, track_id)` to allow
//! per-track granularity. `track_id` is nullable — scene types without tracks
//! have a single row with `track_id IS NULL`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project_scene_setting::{
    EffectiveProjectSceneSetting, ProjectSceneSetting, ProjectSceneSettingUpdate,
};

/// Column list for the `project_scene_settings` table.
const COLUMNS: &str = "id, project_id, scene_type_id, track_id, is_enabled, created_at, updated_at";

/// Provides data access for per-project scene enablement settings.
pub struct ProjectSceneSettingRepo;

impl ProjectSceneSettingRepo {
    /// List the effective scene settings for a project.
    ///
    /// Returns one row per `(scene_type, track)` pair. Scene types with
    /// associated tracks produce one row per track (via CROSS JOIN with
    /// `scene_type_tracks`); scene types without tracks produce a single
    /// row with NULL track fields.
    pub async fn list_effective(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<EffectiveProjectSceneSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveProjectSceneSetting>(
            "SELECT scene_type_id, name, slug, is_enabled, source, track_id, track_name, track_slug, has_clothes_off_transition FROM ( \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE WHEN pss.id IS NOT NULL THEN 'project' ELSE 'scene_type' END AS source, \
                     t.id   AS track_id, \
                     t.name AS track_name, \
                     t.slug AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     t.sort_order  AS t_sort \
                 FROM scene_types st \
                 JOIN scene_type_tracks stt ON stt.scene_type_id = st.id \
                 JOIN tracks t ON t.id = stt.track_id AND t.is_active = true \
                 JOIN projects p ON p.id = $1 \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $1 \
                    AND pss.track_id = t.id \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                   AND (st.pipeline_id = p.pipeline_id OR (st.pipeline_id IS NULL AND p.pipeline_id IS NULL)) \
                 UNION ALL \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE WHEN pss.id IS NOT NULL THEN 'project' ELSE 'scene_type' END AS source, \
                     NULL::BIGINT AS track_id, \
                     NULL::TEXT   AS track_name, \
                     NULL::TEXT   AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     NULL::INT     AS t_sort \
                 FROM scene_types st \
                 JOIN projects p ON p.id = $1 \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $1 \
                    AND pss.track_id IS NULL \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                   AND (st.pipeline_id = p.pipeline_id OR (st.pipeline_id IS NULL AND p.pipeline_id IS NULL)) \
                   AND NOT EXISTS ( \
                       SELECT 1 FROM scene_type_tracks stt WHERE stt.scene_type_id = st.id \
                   ) \
             ) sub \
             ORDER BY sub.st_sort, sub.name, sub.t_sort NULLS LAST, sub.track_name NULLS LAST",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Upsert a single project scene setting.
    pub async fn upsert(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
        is_enabled: bool,
    ) -> Result<ProjectSceneSetting, sqlx::Error> {
        let update = ProjectSceneSettingUpdate {
            scene_type_id,
            track_id,
            is_enabled,
        };
        let mut results = Self::bulk_upsert(pool, project_id, &[update]).await?;
        // bulk_upsert always returns one row per input
        Ok(results.remove(0))
    }

    /// Bulk upsert project scene settings within a transaction.
    pub async fn bulk_upsert(
        pool: &PgPool,
        project_id: DbId,
        settings: &[ProjectSceneSettingUpdate],
    ) -> Result<Vec<ProjectSceneSetting>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(settings.len());

        let query = format!(
            "INSERT INTO project_scene_settings (project_id, scene_type_id, track_id, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (project_id, scene_type_id, track_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for setting in settings {
            let row = sqlx::query_as::<_, ProjectSceneSetting>(&query)
                .bind(project_id)
                .bind(setting.scene_type_id)
                .bind(setting.track_id)
                .bind(setting.is_enabled)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }

    /// Delete a project scene setting override (reverts to scene_type default).
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM project_scene_settings \
             WHERE project_id = $1 \
               AND scene_type_id = $2 \
               AND track_id IS NOT DISTINCT FROM $3",
        )
        .bind(project_id)
        .bind(scene_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
