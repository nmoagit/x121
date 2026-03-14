//! Repository for the `scenes` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::generation::UpdateSceneGeneration;
use crate::models::scene::{CreateScene, Scene, SceneWithVersion, UpdateScene};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, scene_type_id, image_variant_id, track_id, \
    status_id, transition_mode, \
    total_segments_estimated, total_segments_completed, \
    actual_duration_secs, transition_segment_index, \
    generation_started_at, generation_completed_at, \
    resolution_tier_id, upscaled_from_scene_id, \
    deleted_at, created_at, updated_at";

/// Provides CRUD operations for scenes.
pub struct SceneRepo;

impl SceneRepo {
    /// Insert a new scene, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Pending).
    /// If `transition_mode` is `None`, defaults to `'cut'`.
    pub async fn create(pool: &PgPool, input: &CreateScene) -> Result<Scene, sqlx::Error> {
        let query = format!(
            "INSERT INTO scenes
                (character_id, scene_type_id, image_variant_id, track_id, status_id, transition_mode,
                 total_segments_estimated, total_segments_completed,
                 actual_duration_secs, transition_segment_index,
                 generation_started_at, generation_completed_at)
             VALUES ($1, $2, $3, $4, COALESCE($5, 1), COALESCE($6, 'cut'),
                     $7, COALESCE($8, 0), $9, $10, $11, $12)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(input.character_id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(input.track_id)
            .bind(input.status_id)
            .bind(&input.transition_mode)
            .bind(input.total_segments_estimated)
            .bind(input.total_segments_completed)
            .bind(input.actual_duration_secs)
            .bind(input.transition_segment_index)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .fetch_one(pool)
            .await
    }

    /// Find a scene by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scenes WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all scenes for a given character, ordered by creation time ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<Scene>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scenes
             WHERE character_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List scenes for a character with the best video version ID and version count.
    ///
    /// Uses a LATERAL subquery to pick the best version per scene:
    /// final with highest version_number > highest version_number.
    /// This eliminates the N+1 query pattern where the frontend fetches
    /// video versions for each scene individually.
    pub async fn list_by_character_with_versions(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<SceneWithVersion>, sqlx::Error> {
        let cols = COLUMNS
            .split(", ")
            .map(|c| format!("s.{}", c.trim()))
            .collect::<Vec<_>>()
            .join(", ");
        sqlx::query_as::<_, SceneWithVersion>(&format!(
            "SELECT {cols},
                        lv.id AS latest_version_id,
                        COALESCE(vc.cnt, 0) AS version_count,
                        COALESCE(ntf.has_newer, false) AS has_newer_than_final
                 FROM scenes s
                 LEFT JOIN LATERAL (
                     SELECT v.id
                     FROM scene_video_versions v
                     WHERE v.scene_id = s.id AND v.deleted_at IS NULL
                     ORDER BY v.is_final DESC, v.version_number DESC
                     LIMIT 1
                 ) lv ON true
                 LEFT JOIN LATERAL (
                     SELECT COUNT(*) AS cnt
                     FROM scene_video_versions v
                     WHERE v.scene_id = s.id AND v.deleted_at IS NULL
                 ) vc ON true
                 LEFT JOIN LATERAL (
                     SELECT EXISTS(
                         SELECT 1 FROM scene_video_versions v2
                         WHERE v2.scene_id = s.id
                           AND v2.deleted_at IS NULL
                           AND v2.version_number > (
                               SELECT COALESCE(MAX(vf.version_number), 0)
                               FROM scene_video_versions vf
                               WHERE vf.scene_id = s.id
                                 AND vf.deleted_at IS NULL
                                 AND vf.is_final = true
                           )
                           AND EXISTS(
                               SELECT 1 FROM scene_video_versions vf2
                               WHERE vf2.scene_id = s.id
                                 AND vf2.deleted_at IS NULL
                                 AND vf2.is_final = true
                           )
                     ) AS has_newer
                 ) ntf ON true
                 WHERE s.character_id = $1 AND s.deleted_at IS NULL
                 ORDER BY s.created_at ASC"
        ))
        .bind(character_id)
        .fetch_all(pool)
        .await
    }

    /// Update a scene. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateScene,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!(
            "UPDATE scenes SET
                scene_type_id = COALESCE($2, scene_type_id),
                image_variant_id = COALESCE($3, image_variant_id),
                status_id = COALESCE($4, status_id),
                transition_mode = COALESCE($5, transition_mode),
                total_segments_estimated = COALESCE($6, total_segments_estimated),
                total_segments_completed = COALESCE($7, total_segments_completed),
                actual_duration_secs = COALESCE($8, actual_duration_secs),
                transition_segment_index = COALESCE($9, transition_segment_index),
                generation_started_at = COALESCE($10, generation_started_at),
                generation_completed_at = COALESCE($11, generation_completed_at)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(input.status_id)
            .bind(&input.transition_mode)
            .bind(input.total_segments_estimated)
            .bind(input.total_segments_completed)
            .bind(input.actual_duration_secs)
            .bind(input.transition_segment_index)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .fetch_optional(pool)
            .await
    }

    /// Update only the `status_id` of a scene. Returns `true` if a row was updated.
    pub async fn set_status(pool: &PgPool, id: DbId, status_id: i16) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE scenes SET status_id = $2 WHERE id = $1 AND deleted_at IS NULL")
                .bind(id)
                .bind(status_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Find a scene by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scenes WHERE id = $1");
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a scene by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scenes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted scene. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scenes SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a scene by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scenes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all scenes that are actively generating (started but not completed).
    pub async fn list_generating(pool: &PgPool) -> Result<Vec<Scene>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scenes
             WHERE generation_started_at IS NOT NULL
               AND generation_completed_at IS NULL
               AND deleted_at IS NULL
             ORDER BY generation_started_at ASC"
        );
        sqlx::query_as::<_, Scene>(&query).fetch_all(pool).await
    }

    // -- Generation-specific methods (PRD-24) ---------------------------------

    /// Update only generation-specific fields on a scene.
    pub async fn update_generation_state(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneGeneration,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!(
            "UPDATE scenes SET
                status_id = COALESCE($2, status_id),
                total_segments_estimated = COALESCE($3, total_segments_estimated),
                total_segments_completed = COALESCE($4, total_segments_completed),
                actual_duration_secs = COALESCE($5, actual_duration_secs),
                transition_segment_index = COALESCE($6, transition_segment_index),
                generation_started_at = COALESCE($7, generation_started_at),
                generation_completed_at = COALESCE($8, generation_completed_at)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(id)
            .bind(input.status_id)
            .bind(input.total_segments_estimated)
            .bind(input.total_segments_completed)
            .bind(input.actual_duration_secs)
            .bind(input.transition_segment_index)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .fetch_optional(pool)
            .await
    }

    /// Set the image_variant_id for a scene (auto-resolve seed image).
    pub async fn update_image_variant(
        pool: &PgPool,
        scene_id: DbId,
        variant_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scenes SET image_variant_id = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .bind(variant_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Atomically increment `total_segments_completed` by 1.
    pub async fn increment_completed_segments(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!(
            "UPDATE scenes SET
                total_segments_completed = total_segments_completed + 1
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(scene_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark generation as complete, setting `generation_completed_at` and
    /// `actual_duration_secs` in one atomic update.
    pub async fn mark_generation_complete(
        pool: &PgPool,
        scene_id: DbId,
        actual_duration: f64,
    ) -> Result<Option<Scene>, sqlx::Error> {
        let query = format!(
            "UPDATE scenes SET
                status_id = 3,
                generation_completed_at = NOW(),
                actual_duration_secs = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Scene>(&query)
            .bind(scene_id)
            .bind(actual_duration)
            .fetch_optional(pool)
            .await
    }
}
