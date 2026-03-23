//! Repository for the `group_scene_settings` table.
//!
//! Intermediate tier of the four-level inheritance chain:
//! scene_type defaults -> project settings -> group settings -> avatar overrides.
//!
//! Settings are keyed on `(group_id, scene_type_id, track_id)` to allow
//! per-track granularity. `track_id` is nullable — scene types without tracks
//! have a single row with `track_id IS NULL`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::group_scene_setting::{
    EffectiveGroupSceneSetting, GroupSceneSetting, GroupSceneSettingUpdate,
};

/// Column list for the `group_scene_settings` table.
const COLUMNS: &str = "id, group_id, scene_type_id, track_id, is_enabled, created_at, updated_at";

/// Provides data access for per-group scene enablement settings.
pub struct GroupSceneSettingRepo;

impl GroupSceneSettingRepo {
    /// List the effective scene settings for a group.
    ///
    /// Three-level merge per `(scene_type, track)` pair:
    /// 1. Start with scene_type `is_active` as the base default.
    /// 2. Override with project setting if one exists.
    /// 3. Override with group setting if one exists.
    ///
    /// Scene types with tracks produce one row per active track (via CROSS JOIN);
    /// scene types without tracks produce a single row with NULL track fields.
    pub async fn list_effective(
        pool: &PgPool,
        group_id: DbId,
        project_id: DbId,
    ) -> Result<Vec<EffectiveGroupSceneSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveGroupSceneSetting>(
            "SELECT scene_type_id, name, slug, is_enabled, source, track_id, track_name, track_slug, has_clothes_off_transition FROM ( \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(gss.is_enabled, pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE \
                         WHEN gss.id IS NOT NULL THEN 'group' \
                         WHEN pss.id IS NOT NULL THEN 'project' \
                         ELSE 'scene_type' \
                     END AS source, \
                     t.id   AS track_id, \
                     t.name AS track_name, \
                     t.slug AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     t.sort_order  AS t_sort \
                 FROM scene_types st \
                 JOIN scene_type_tracks stt ON stt.scene_type_id = st.id \
                 JOIN tracks t ON t.id = stt.track_id AND t.is_active = true \
                 JOIN projects p ON p.id = $2 \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $2 \
                    AND pss.track_id = t.id \
                 LEFT JOIN group_scene_settings gss \
                     ON gss.scene_type_id = st.id \
                    AND gss.group_id = $1 \
                    AND gss.track_id = t.id \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                   AND (st.pipeline_id = p.pipeline_id OR (st.pipeline_id IS NULL AND p.pipeline_id IS NULL)) \
                 UNION ALL \
                 SELECT \
                     st.id AS scene_type_id, \
                     st.name, \
                     st.slug, \
                     COALESCE(gss.is_enabled, pss.is_enabled, st.is_active) AS is_enabled, \
                     CASE \
                         WHEN gss.id IS NOT NULL THEN 'group' \
                         WHEN pss.id IS NOT NULL THEN 'project' \
                         ELSE 'scene_type' \
                     END AS source, \
                     NULL::BIGINT AS track_id, \
                     NULL::TEXT   AS track_name, \
                     NULL::TEXT   AS track_slug, \
                     st.has_clothes_off_transition, \
                     st.sort_order AS st_sort, \
                     NULL::INT     AS t_sort \
                 FROM scene_types st \
                 JOIN projects p ON p.id = $2 \
                 LEFT JOIN project_scene_settings pss \
                     ON pss.scene_type_id = st.id \
                    AND pss.project_id = $2 \
                    AND pss.track_id IS NULL \
                 LEFT JOIN group_scene_settings gss \
                     ON gss.scene_type_id = st.id \
                    AND gss.group_id = $1 \
                    AND gss.track_id IS NULL \
                 WHERE st.is_active = true AND st.deleted_at IS NULL \
                   AND (st.pipeline_id = p.pipeline_id OR (st.pipeline_id IS NULL AND p.pipeline_id IS NULL)) \
                   AND NOT EXISTS ( \
                       SELECT 1 FROM scene_type_tracks stt WHERE stt.scene_type_id = st.id \
                   ) \
             ) sub \
             ORDER BY sub.st_sort, sub.name, sub.t_sort NULLS LAST, sub.track_name NULLS LAST",
        )
        .bind(group_id)
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Upsert a single group scene setting.
    pub async fn upsert(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
        is_enabled: bool,
    ) -> Result<GroupSceneSetting, sqlx::Error> {
        let update = GroupSceneSettingUpdate {
            scene_type_id,
            track_id,
            is_enabled,
        };
        let mut results = Self::bulk_upsert(pool, group_id, &[update]).await?;
        Ok(results.remove(0))
    }

    /// Bulk upsert group scene settings within a transaction.
    pub async fn bulk_upsert(
        pool: &PgPool,
        group_id: DbId,
        settings: &[GroupSceneSettingUpdate],
    ) -> Result<Vec<GroupSceneSetting>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(settings.len());

        let query = format!(
            "INSERT INTO group_scene_settings (group_id, scene_type_id, track_id, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (group_id, scene_type_id, track_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for setting in settings {
            let row = sqlx::query_as::<_, GroupSceneSetting>(&query)
                .bind(group_id)
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

    /// Delete a group scene setting override (reverts to project/scene_type default).
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM group_scene_settings \
             WHERE group_id = $1 \
               AND scene_type_id = $2 \
               AND track_id IS NOT DISTINCT FROM $3",
        )
        .bind(group_id)
        .bind(scene_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all group scene settings for a group.
    ///
    /// Returns the number of rows removed.
    pub async fn delete_all(pool: &PgPool, group_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM group_scene_settings WHERE group_id = $1")
            .bind(group_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
