//! Repository for the `project_scene_settings` table (PRD-111, PRD-123).
//!
//! Middle tier of the three-level inheritance chain:
//! scene_type defaults -> project settings -> character overrides.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project_scene_setting::{
    EffectiveProjectSceneSetting, ProjectSceneSetting, ProjectSceneSettingUpdate,
};

/// Column list for the `project_scene_settings` table.
const COLUMNS: &str = "id, project_id, scene_type_id, is_enabled, created_at, updated_at";

/// Provides data access for per-project scene enablement settings.
pub struct ProjectSceneSettingRepo;

impl ProjectSceneSettingRepo {
    /// List the effective scene settings for a project.
    ///
    /// For every active scene_type entry, returns whether it is enabled
    /// for this project and the source of the setting (`"scene_type"` or `"project"`).
    pub async fn list_effective(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<EffectiveProjectSceneSetting>, sqlx::Error> {
        sqlx::query_as::<_, EffectiveProjectSceneSetting>(
            "SELECT \
                st.id AS scene_type_id, \
                st.name, \
                st.slug, \
                COALESCE(pss.is_enabled, st.is_active) AS is_enabled, \
                CASE WHEN pss.id IS NOT NULL THEN 'project' ELSE 'scene_type' END AS source \
             FROM scene_types st \
             LEFT JOIN project_scene_settings pss \
                ON pss.scene_type_id = st.id AND pss.project_id = $1 \
             WHERE st.is_active = true AND st.deleted_at IS NULL \
             ORDER BY st.sort_order, st.name",
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
        is_enabled: bool,
    ) -> Result<ProjectSceneSetting, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_scene_settings (project_id, scene_type_id, is_enabled) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (project_id, scene_type_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProjectSceneSetting>(&query)
            .bind(project_id)
            .bind(scene_type_id)
            .bind(is_enabled)
            .fetch_one(pool)
            .await
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
            "INSERT INTO project_scene_settings (project_id, scene_type_id, is_enabled) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (project_id, scene_type_id) \
             DO UPDATE SET is_enabled = EXCLUDED.is_enabled \
             RETURNING {COLUMNS}"
        );

        for setting in settings {
            let row = sqlx::query_as::<_, ProjectSceneSetting>(&query)
                .bind(project_id)
                .bind(setting.scene_type_id)
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
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM project_scene_settings \
             WHERE project_id = $1 AND scene_type_id = $2",
        )
        .bind(project_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
