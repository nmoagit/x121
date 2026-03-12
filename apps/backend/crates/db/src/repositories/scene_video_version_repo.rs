//! Repository for the `scene_video_versions` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_video_version::{
    CreateSceneVideoVersion, SceneVideoVersion, UpdateSceneVideoVersion,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, scene_id, version_number, source, file_path, \
    file_size_bytes, duration_secs, width, height, frame_rate, preview_path, is_final, notes, \
    qa_status, qa_reviewed_by, qa_reviewed_at, qa_rejection_reason, qa_notes, \
    generation_snapshot, deleted_at, created_at, updated_at";

/// Provides CRUD and version-management operations for scene video versions.
pub struct SceneVideoVersionRepo;

impl SceneVideoVersionRepo {
    // ── Standard CRUD ────────────────────────────────────────────────

    /// Insert a new scene video version, auto-assigning the next version number.
    ///
    /// If `is_final` is `None`, defaults to `false`.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSceneVideoVersion,
    ) -> Result<SceneVideoVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_video_versions
                (scene_id, version_number, source, file_path, file_size_bytes, duration_secs, is_final, notes, generation_snapshot)
             VALUES (
                $1,
                (SELECT COALESCE(MAX(version_number), 0) + 1 FROM scene_video_versions WHERE scene_id = $1),
                $2, $3, $4, $5, COALESCE($6, false), $7, $8
             )
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(input.scene_id)
            .bind(&input.source)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.duration_secs)
            .bind(input.is_final)
            .bind(&input.notes)
            .bind(&input.generation_snapshot)
            .fetch_one(pool)
            .await
    }

    /// Find a scene video version by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions WHERE id = $1 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all versions for a given scene, ordered by version number descending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS},
                    COALESCE((SELECT COUNT(*) FROM frame_annotations fa
                              WHERE fa.version_id = scene_video_versions.id), 0) AS annotation_count
             FROM scene_video_versions
             WHERE scene_id = $1 AND deleted_at IS NULL
             ORDER BY version_number DESC"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Update a scene video version. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists (or is soft-deleted).
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneVideoVersion,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "UPDATE scene_video_versions SET
                is_final = COALESCE($2, is_final),
                notes = COALESCE($3, notes),
                qa_status = COALESCE($4, qa_status),
                qa_reviewed_by = COALESCE($5, qa_reviewed_by),
                qa_reviewed_at = COALESCE($6, qa_reviewed_at),
                qa_rejection_reason = COALESCE($7, qa_rejection_reason),
                qa_notes = COALESCE($8, qa_notes)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(id)
            .bind(input.is_final)
            .bind(&input.notes)
            .bind(&input.qa_status)
            .bind(input.qa_reviewed_by)
            .bind(input.qa_reviewed_at)
            .bind(&input.qa_rejection_reason)
            .bind(&input.qa_notes)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a scene video version by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted scene video version. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NULL \
             WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft-delete all versions for a scene with version_number > the given threshold.
    pub async fn soft_delete_after_version(
        pool: &PgPool,
        scene_id: DbId,
        version_number: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET deleted_at = NOW() \
             WHERE scene_id = $1 AND version_number > $2 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .bind(version_number)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Permanently delete a scene video version by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_video_versions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set video metadata (duration, resolution, frame rate) extracted via ffprobe.
    pub async fn set_video_metadata(
        pool: &PgPool,
        id: DbId,
        duration_secs: f64,
        width: i32,
        height: i32,
        frame_rate: f64,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions \
             SET duration_secs = $2, width = $3, height = $4, frame_rate = $5 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(duration_secs)
        .bind(width)
        .bind(height)
        .bind(frame_rate)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all versions that have no duration_secs. Useful for backfilling
    /// duration metadata on existing data. Limited to avoid OOM on large datasets.
    pub async fn list_missing_duration(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE (duration_secs IS NULL OR width IS NULL OR frame_rate IS NULL) \
             AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Set the preview_path for a scene video version. Returns `true` if a row was updated.
    pub async fn set_preview_path(
        pool: &PgPool,
        id: DbId,
        path: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_video_versions SET preview_path = $2 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(path)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Version-specific operations ──────────────────────────────────

    /// Get the next version number for a scene (max existing + 1, or 1 if none).
    pub async fn next_version_number(pool: &PgPool, scene_id: DbId) -> Result<i32, sqlx::Error> {
        let row: (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_number), 0) + 1 \
             FROM scene_video_versions WHERE scene_id = $1",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    /// Mark a version as final, un-marking any previously final version for the
    /// same scene. Uses a transaction to ensure atomicity.
    ///
    /// Returns `None` if `version_id` does not exist for the given `scene_id`.
    pub async fn set_final(
        pool: &PgPool,
        scene_id: DbId,
        version_id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Unmark current final (if any)
        sqlx::query(
            "UPDATE scene_video_versions SET is_final = false \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .execute(&mut *tx)
        .await?;

        // Mark the specified version as final
        let query = format!(
            "UPDATE scene_video_versions SET is_final = true \
             WHERE id = $1 AND scene_id = $2 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        let result = sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(version_id)
            .bind(scene_id)
            .fetch_optional(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(result)
    }

    /// Find the current final version for a scene (if any).
    pub async fn find_final_for_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Option<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(scene_id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new version and automatically mark it as final, un-marking any
    /// previously final version in the same transaction.
    pub async fn create_as_final(
        pool: &PgPool,
        input: &CreateSceneVideoVersion,
    ) -> Result<SceneVideoVersion, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Get next version number
        let next_ver: (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(version_number), 0) + 1 \
             FROM scene_video_versions WHERE scene_id = $1",
        )
        .bind(input.scene_id)
        .fetch_one(&mut *tx)
        .await?;

        // Unmark current final
        sqlx::query(
            "UPDATE scene_video_versions SET is_final = false \
             WHERE scene_id = $1 AND is_final = true AND deleted_at IS NULL",
        )
        .bind(input.scene_id)
        .execute(&mut *tx)
        .await?;

        // Insert new version as final
        let query = format!(
            "INSERT INTO scene_video_versions
                (scene_id, version_number, source, file_path, file_size_bytes, duration_secs, is_final, notes, generation_snapshot)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
             RETURNING {COLUMNS}"
        );
        let version = sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(input.scene_id)
            .bind(next_ver.0)
            .bind(&input.source)
            .bind(&input.file_path)
            .bind(input.file_size_bytes)
            .bind(input.duration_secs)
            .bind(&input.notes)
            .bind(&input.generation_snapshot)
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(version)
    }

    /// List all versions that have a video file but no preview. Useful for
    /// backfilling previews on existing data. Limited to avoid OOM on large datasets.
    pub async fn list_missing_previews(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<SceneVideoVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_video_versions \
             WHERE preview_path IS NULL AND deleted_at IS NULL \
             ORDER BY id ASC LIMIT $1"
        );
        sqlx::query_as::<_, SceneVideoVersion>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Find scene IDs in a project that have no final video version with
    /// actual content (non-empty file).
    ///
    /// A version is considered "empty" if `file_size_bytes` is NULL or 0.
    /// Empty versions are excluded so they are not treated as completed
    /// deliverables.
    pub async fn find_scenes_missing_final(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<DbId>, sqlx::Error> {
        let rows: Vec<(DbId,)> = sqlx::query_as(
            "SELECT s.id \
             FROM scenes s \
             JOIN characters c ON s.character_id = c.id \
             WHERE c.project_id = $1 \
               AND s.deleted_at IS NULL \
               AND c.deleted_at IS NULL \
               AND NOT EXISTS ( \
                   SELECT 1 FROM scene_video_versions v \
                   WHERE v.scene_id = s.id \
                     AND v.is_final = true \
                     AND v.deleted_at IS NULL \
                     AND v.file_size_bytes IS NOT NULL \
                     AND v.file_size_bytes > 0 \
               )",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    /// Count non-empty video versions for a scene (versions with actual file content).
    ///
    /// Excludes soft-deleted versions and versions where `file_size_bytes` is NULL or 0.
    pub async fn count_non_empty_versions(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM scene_video_versions \
             WHERE scene_id = $1 \
               AND deleted_at IS NULL \
               AND file_size_bytes IS NOT NULL \
               AND file_size_bytes > 0",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }
}
