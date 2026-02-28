//! Repository for the `scene_type_overrides` table (PRD-100).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type_override::{SceneTypeOverride, UpsertOverride};

/// Provides data access for scene type field-level overrides.
pub struct SceneTypeOverrideRepo;

impl SceneTypeOverrideRepo {
    /// List all overrides for a given scene type, ordered by field name.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<SceneTypeOverride>, sqlx::Error> {
        sqlx::query_as::<_, SceneTypeOverride>(
            "SELECT id, scene_type_id, field_name, override_value, created_at, updated_at \
             FROM scene_type_overrides WHERE scene_type_id = $1 ORDER BY field_name",
        )
        .bind(scene_type_id)
        .fetch_all(pool)
        .await
    }

    /// Insert or update a single field override.
    pub async fn upsert(
        pool: &PgPool,
        scene_type_id: DbId,
        input: &UpsertOverride,
    ) -> Result<SceneTypeOverride, sqlx::Error> {
        sqlx::query_as::<_, SceneTypeOverride>(
            "INSERT INTO scene_type_overrides (scene_type_id, field_name, override_value) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (scene_type_id, field_name) \
             DO UPDATE SET override_value = EXCLUDED.override_value \
             RETURNING id, scene_type_id, field_name, override_value, created_at, updated_at",
        )
        .bind(scene_type_id)
        .bind(&input.field_name)
        .bind(&input.override_value)
        .fetch_one(pool)
        .await
    }

    /// Delete a single field override. Returns `true` if a row was removed.
    pub async fn delete(
        pool: &PgPool,
        scene_type_id: DbId,
        field_name: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM scene_type_overrides \
             WHERE scene_type_id = $1 AND field_name = $2",
        )
        .bind(scene_type_id)
        .bind(field_name)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List the field names of overrides for a scene type (without the full row).
    pub async fn list_field_names(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<String>, sqlx::Error> {
        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT field_name FROM scene_type_overrides WHERE scene_type_id = $1")
                .bind(scene_type_id)
                .fetch_all(pool)
                .await?;
        Ok(rows.into_iter().map(|(f,)| f).collect())
    }

    /// Delete all overrides for a scene type. Returns the number of rows removed.
    pub async fn delete_all(pool: &PgPool, scene_type_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_type_overrides WHERE scene_type_id = $1")
            .bind(scene_type_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
