//! Repository for the `scene_video_version_artifacts` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_video_version_artifact::{CreateArtifact, SceneVideoVersionArtifact};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, version_id, role, label, node_id, file_path, \
    file_size_bytes, duration_secs, width, height, sort_order, \
    file_purged, deleted_at, created_at, updated_at";

/// Provides CRUD operations for scene video version artifacts.
pub struct SceneVideoVersionArtifactRepo;

impl SceneVideoVersionArtifactRepo {
    /// Insert a new artifact for a scene video version.
    pub async fn create(
        pool: &PgPool,
        input: &CreateArtifact,
    ) -> Result<SceneVideoVersionArtifact, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_video_version_artifacts
                (version_id, role, label, node_id, file_path, file_size_bytes, \
                 duration_secs, width, height, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneVideoVersionArtifact>(&query)
            .bind(input.version_id)
            .bind(&input.role)
            .bind(&input.label)
            .bind(&input.node_id)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.duration_secs)
            .bind(input.width)
            .bind(input.height)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// List all artifacts for a given version, ordered by sort_order ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_version(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<Vec<SceneVideoVersionArtifact>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_version_artifacts
             WHERE version_id = $1 AND deleted_at IS NULL
             ORDER BY sort_order ASC"
        );
        sqlx::query_as::<_, SceneVideoVersionArtifact>(&query)
            .bind(version_id)
            .fetch_all(pool)
            .await
    }

    /// Soft-delete an artifact by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_version_artifacts SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft-delete all artifacts for a given version. Returns the number of rows affected.
    pub async fn soft_delete_by_version(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_version_artifacts SET deleted_at = NOW() \
             WHERE version_id = $1 AND deleted_at IS NULL",
        )
        .bind(version_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
