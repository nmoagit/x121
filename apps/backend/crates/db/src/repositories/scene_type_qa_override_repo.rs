//! Repository for the `scene_type_qa_overrides` table (PRD-91).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type_qa_override::{SceneTypeQaOverride, UpsertSceneTypeQaOverride};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, scene_type_id, qa_profile_id, custom_thresholds, created_at, updated_at";

/// Provides data access for scene type QA overrides.
pub struct SceneTypeQaOverrideRepo;

impl SceneTypeQaOverrideRepo {
    /// Find the QA override for a specific scene type.
    pub async fn find_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Option<SceneTypeQaOverride>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM scene_type_qa_overrides WHERE scene_type_id = $1");
        sqlx::query_as::<_, SceneTypeQaOverride>(&query)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a QA override for a scene type.
    ///
    /// Uses ON CONFLICT on `scene_type_id` (unique index) to update if it already exists.
    pub async fn upsert(
        pool: &PgPool,
        scene_type_id: DbId,
        input: &UpsertSceneTypeQaOverride,
    ) -> Result<SceneTypeQaOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_type_qa_overrides \
                (scene_type_id, qa_profile_id, custom_thresholds) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (scene_type_id) \
             DO UPDATE SET \
                qa_profile_id = EXCLUDED.qa_profile_id, \
                custom_thresholds = EXCLUDED.custom_thresholds, \
                updated_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneTypeQaOverride>(&query)
            .bind(scene_type_id)
            .bind(input.qa_profile_id)
            .bind(&input.custom_thresholds)
            .fetch_one(pool)
            .await
    }

    /// Delete the QA override for a scene type. Returns `true` if a row was removed.
    pub async fn delete_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_type_qa_overrides WHERE scene_type_id = $1")
            .bind(scene_type_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
