//! Repository for the `scene_artifacts` table (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_artifact::{CreateSceneArtifact, SceneArtifact, UpdateSceneArtifact};

/// Column list for the `scene_artifacts` table.
const COLUMNS: &str = "id, scene_id, artifact_type, sequence_index, file_path, \
    duration_secs, resolution, metadata, created_at, updated_at";

/// Provides CRUD operations for scene artifacts.
pub struct SceneArtifactRepo;

impl SceneArtifactRepo {
    /// Insert a new scene artifact, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSceneArtifact,
    ) -> Result<SceneArtifact, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_artifacts
                (scene_id, artifact_type, sequence_index, file_path,
                 duration_secs, resolution, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '{{}}'::jsonb))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneArtifact>(&query)
            .bind(input.scene_id)
            .bind(&input.artifact_type)
            .bind(input.sequence_index)
            .bind(&input.file_path)
            .bind(input.duration_secs)
            .bind(&input.resolution)
            .bind(&input.metadata)
            .fetch_one(pool)
            .await
    }

    /// Find a scene artifact by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneArtifact>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scene_artifacts WHERE id = $1");
        sqlx::query_as::<_, SceneArtifact>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all artifacts for a scene, ordered by sequence index.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<SceneArtifact>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_artifacts \
             WHERE scene_id = $1 ORDER BY sequence_index, id"
        );
        sqlx::query_as::<_, SceneArtifact>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Update a scene artifact. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneArtifact,
    ) -> Result<Option<SceneArtifact>, sqlx::Error> {
        let query = format!(
            "UPDATE scene_artifacts SET
                artifact_type = COALESCE($2, artifact_type),
                sequence_index = COALESCE($3, sequence_index),
                file_path = COALESCE($4, file_path),
                duration_secs = COALESCE($5, duration_secs),
                resolution = COALESCE($6, resolution),
                metadata = COALESCE($7, metadata)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneArtifact>(&query)
            .bind(id)
            .bind(&input.artifact_type)
            .bind(input.sequence_index)
            .bind(&input.file_path)
            .bind(input.duration_secs)
            .bind(&input.resolution)
            .bind(&input.metadata)
            .fetch_optional(pool)
            .await
    }

    /// Delete a scene artifact by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_artifacts WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
