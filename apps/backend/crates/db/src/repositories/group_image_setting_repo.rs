//! Repository for the `group_image_settings` table (PRD-154).
//!
//! Intermediate tier of the three-level inheritance chain:
//! image_type defaults -> project settings -> group settings -> avatar overrides.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::group_image_setting::{
    EffectiveGroupImageSetting, GroupImageSetting, GroupImageSettingUpdate,
};

/// Column list for the `group_image_settings` table.
const COLUMNS: &str = "id, group_id, image_type_id, track_id, is_enabled, created_at, updated_at";

/// Provides data access for per-group image enablement settings.
pub struct GroupImageSettingRepo;

impl GroupImageSettingRepo {
    /// List the effective image settings for a group.
    ///
    /// Three-level merge per `(image_type, track)` pair:
    /// 1. Start with image_type `is_active` as the base default.
    /// 2. Override with project setting if one exists.
    /// 3. Override with group setting if one exists.
    pub async fn list_effective(
        pool: &PgPool,
        group_id: DbId,
        project_id: DbId,
    ) -> Result<Vec<EffectiveGroupImageSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveGroupImageSetting>(
            "SELECT image_type_id, name, slug, is_enabled, source, track_id, track_name, track_slug FROM ( \
                 SELECT \
                     it.id AS image_type_id, \
                     it.name, \
                     it.slug, \
                     COALESCE(gis.is_enabled, pis.is_enabled, it.is_active) AS is_enabled, \
                     CASE \
                         WHEN gis.id IS NOT NULL THEN 'group' \
                         WHEN pis.id IS NOT NULL THEN 'project' \
                         ELSE 'image_type' \
                     END AS source, \
                     t.id   AS track_id, \
                     t.name AS track_name, \
                     t.slug AS track_slug, \
                     it.sort_order AS it_sort, \
                     t.sort_order  AS t_sort \
                 FROM image_types it \
                 JOIN image_type_tracks itt ON itt.image_type_id = it.id \
                 JOIN tracks t ON t.id = itt.track_id AND t.is_active = true \
                 JOIN projects p ON p.id = $2 \
                 LEFT JOIN project_image_settings pis \
                     ON pis.image_type_id = it.id \
                    AND pis.project_id = $2 \
                    AND pis.track_id = t.id \
                 LEFT JOIN group_image_settings gis \
                     ON gis.image_type_id = it.id \
                    AND gis.group_id = $1 \
                    AND gis.track_id = t.id \
                 WHERE it.is_active = true AND it.deleted_at IS NULL \
                   AND it.pipeline_id = p.pipeline_id \
                 UNION ALL \
                 SELECT \
                     it.id AS image_type_id, \
                     it.name, \
                     it.slug, \
                     COALESCE(gis.is_enabled, pis.is_enabled, it.is_active) AS is_enabled, \
                     CASE \
                         WHEN gis.id IS NOT NULL THEN 'group' \
                         WHEN pis.id IS NOT NULL THEN 'project' \
                         ELSE 'image_type' \
                     END AS source, \
                     NULL::BIGINT AS track_id, \
                     NULL::TEXT   AS track_name, \
                     NULL::TEXT   AS track_slug, \
                     it.sort_order AS it_sort, \
                     NULL::INT     AS t_sort \
                 FROM image_types it \
                 JOIN projects p ON p.id = $2 \
                 LEFT JOIN project_image_settings pis \
                     ON pis.image_type_id = it.id \
                    AND pis.project_id = $2 \
                    AND pis.track_id IS NULL \
                 LEFT JOIN group_image_settings gis \
                     ON gis.image_type_id = it.id \
                    AND gis.group_id = $1 \
                    AND gis.track_id IS NULL \
                 WHERE it.is_active = true AND it.deleted_at IS NULL \
                   AND it.pipeline_id = p.pipeline_id \
                   AND NOT EXISTS ( \
                       SELECT 1 FROM image_type_tracks itt WHERE itt.image_type_id = it.id \
                   ) \
             ) sub \
             ORDER BY sub.it_sort, sub.name, sub.t_sort NULLS LAST, sub.track_name NULLS LAST",
        )
        .bind(group_id)
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Upsert a single group image setting.
    pub async fn upsert(
        pool: &PgPool,
        group_id: DbId,
        image_type_id: DbId,
        track_id: Option<DbId>,
        is_enabled: bool,
    ) -> Result<GroupImageSetting, sqlx::Error> {
        let update = GroupImageSettingUpdate {
            image_type_id,
            track_id,
            is_enabled,
        };
        let mut results = Self::bulk_upsert(pool, group_id, &[update]).await?;
        Ok(results.remove(0))
    }

    /// Bulk upsert group image settings within a transaction.
    pub async fn bulk_upsert(
        pool: &PgPool,
        group_id: DbId,
        settings: &[GroupImageSettingUpdate],
    ) -> Result<Vec<GroupImageSetting>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(settings.len());

        let query = format!(
            "INSERT INTO group_image_settings (group_id, image_type_id, track_id, is_enabled) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (group_id, image_type_id, COALESCE(track_id, -1)) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for setting in settings {
            let row = sqlx::query_as::<_, GroupImageSetting>(&query)
                .bind(group_id)
                .bind(setting.image_type_id)
                .bind(setting.track_id)
                .bind(setting.is_enabled)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }

    /// Delete a group image setting override.
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete(
        pool: &PgPool,
        group_id: DbId,
        image_type_id: DbId,
        track_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM group_image_settings \
             WHERE group_id = $1 \
               AND image_type_id = $2 \
               AND track_id IS NOT DISTINCT FROM $3",
        )
        .bind(group_id)
        .bind(image_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
