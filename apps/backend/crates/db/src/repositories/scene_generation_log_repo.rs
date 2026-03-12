//! Repository for the `scene_generation_logs` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_generation_log::{CreateGenerationLog, SceneGenerationLog};

/// Column list shared across queries.
const COLUMNS: &str = "id, scene_id, level, message, metadata, created_at";

/// Provides operations for scene generation log entries.
pub struct SceneGenerationLogRepo;

impl SceneGenerationLogRepo {
    /// Insert a new generation log entry, returning the created row.
    pub async fn insert(
        pool: &PgPool,
        input: &CreateGenerationLog,
    ) -> Result<SceneGenerationLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_generation_logs (scene_id, level, message, metadata)
             VALUES ($1, $2, $3, $4)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneGenerationLog>(&query)
            .bind(input.scene_id)
            .bind(&input.level)
            .bind(&input.message)
            .bind(&input.metadata)
            .fetch_one(pool)
            .await
    }

    /// List log entries for a scene, ordered by `created_at ASC` (oldest first).
    pub async fn list_for_scene(
        pool: &PgPool,
        scene_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SceneGenerationLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_generation_logs
             WHERE scene_id = $1
             ORDER BY created_at ASC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, SceneGenerationLog>(&query)
            .bind(scene_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List the most recent generation log entries across all scenes.
    ///
    /// Returns newest first, useful for a global activity console view.
    pub async fn list_recent(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<SceneGenerationLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_generation_logs
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, SceneGenerationLog>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Delete all log entries for a scene. Returns the number of rows deleted.
    ///
    /// Used to clear old logs when re-starting generation.
    pub async fn delete_for_scene(pool: &PgPool, scene_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_generation_logs WHERE scene_id = $1")
            .bind(scene_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
