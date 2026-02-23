//! Repository for the `test_shots` table (PRD-58).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::test_shot::{CreateTestShot, TestShot};

/// Column list for test_shots queries.
const COLUMNS: &str = "id, scene_type_id, character_id, workflow_id, parameters, \
    seed_image_path, output_video_path, last_frame_path, duration_secs, \
    quality_score, is_promoted, promoted_to_scene_id, created_by_id, \
    created_at, updated_at";

/// Provides CRUD operations for test shots.
pub struct TestShotRepo;

impl TestShotRepo {
    /// Insert a new test shot, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateTestShot,
    ) -> Result<TestShot, sqlx::Error> {
        let query = format!(
            "INSERT INTO test_shots
                (scene_type_id, character_id, workflow_id, parameters,
                 seed_image_path, duration_secs, created_by_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(input.scene_type_id)
            .bind(input.character_id)
            .bind(input.workflow_id)
            .bind(&input.parameters)
            .bind(&input.seed_image_path)
            .bind(input.duration_secs)
            .bind(input.created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find a test shot by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<TestShot>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM test_shots WHERE id = $1"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List test shots for a given scene type with pagination.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<TestShot>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM test_shots
             WHERE scene_type_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(scene_type_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List test shots for a given character with pagination.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<TestShot>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM test_shots
             WHERE character_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(character_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List test shots as a filterable gallery.
    ///
    /// Requires `scene_type_id`; optionally filters by `character_id`.
    pub async fn list_gallery(
        pool: &PgPool,
        scene_type_id: DbId,
        character_id: Option<DbId>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<TestShot>, sqlx::Error> {
        if let Some(cid) = character_id {
            let query = format!(
                "SELECT {COLUMNS} FROM test_shots
                 WHERE scene_type_id = $1 AND character_id = $2
                 ORDER BY created_at DESC
                 LIMIT $3 OFFSET $4"
            );
            sqlx::query_as::<_, TestShot>(&query)
                .bind(scene_type_id)
                .bind(cid)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM test_shots
                 WHERE scene_type_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, TestShot>(&query)
                .bind(scene_type_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        }
    }

    /// Update output fields after generation completes.
    pub async fn update_output(
        pool: &PgPool,
        id: DbId,
        output_video_path: &str,
        last_frame_path: &str,
        duration_secs: Option<f64>,
        quality_score: Option<f64>,
    ) -> Result<Option<TestShot>, sqlx::Error> {
        let query = format!(
            "UPDATE test_shots SET
                output_video_path = $1,
                last_frame_path = $2,
                duration_secs = COALESCE($3, duration_secs),
                quality_score = $4
             WHERE id = $5
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(output_video_path)
            .bind(last_frame_path)
            .bind(duration_secs)
            .bind(quality_score)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a test shot as promoted, linking to the created scene.
    pub async fn mark_promoted(
        pool: &PgPool,
        id: DbId,
        scene_id: DbId,
    ) -> Result<Option<TestShot>, sqlx::Error> {
        let query = format!(
            "UPDATE test_shots SET
                is_promoted = true,
                promoted_to_scene_id = $1
             WHERE id = $2
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, TestShot>(&query)
            .bind(scene_id)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a test shot by its ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM test_shots WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count test shots for a given scene type.
    pub async fn count_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM test_shots WHERE scene_type_id = $1")
                .bind(scene_type_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}
