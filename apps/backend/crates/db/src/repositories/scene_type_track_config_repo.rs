//! Repository for the `scene_type_track_configs` table.
//!
//! Provides CRUD + upsert for per-(scene_type, track) workflow and prompt
//! override configuration.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type_track_config::{
    CreateSceneTypeTrackConfig, SceneTypeTrackConfig, SceneTypeTrackConfigWithTrack,
    UpdateSceneTypeTrackConfig,
};

/// Column list for single-table queries.
const COLUMNS: &str = "id, scene_type_id, track_id, is_clothes_off, workflow_id, \
    prompt_template, negative_prompt_template, \
    prompt_start_clip, negative_prompt_start_clip, \
    prompt_continuation_clip, negative_prompt_continuation_clip, \
    created_at, updated_at";

/// Column list for queries that JOIN with `tracks`.
const COLUMNS_WITH_TRACK: &str =
    "c.id, c.scene_type_id, c.track_id, c.is_clothes_off, c.workflow_id, \
    c.prompt_template, c.negative_prompt_template, \
    c.prompt_start_clip, c.negative_prompt_start_clip, \
    c.prompt_continuation_clip, c.negative_prompt_continuation_clip, \
    c.created_at, c.updated_at, \
    t.name AS track_name, t.slug AS track_slug";

/// Provides CRUD operations for scene type track configs.
pub struct SceneTypeTrackConfigRepo;

impl SceneTypeTrackConfigRepo {
    /// Find a config by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneTypeTrackConfig>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM scene_type_track_configs WHERE id = $1");
        sqlx::query_as::<_, SceneTypeTrackConfig>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a config by its unique (scene_type_id, track_id, is_clothes_off) triple.
    pub async fn find_by_scene_type_and_track(
        pool: &PgPool,
        scene_type_id: DbId,
        track_id: DbId,
        is_clothes_off: bool,
    ) -> Result<Option<SceneTypeTrackConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_type_track_configs \
             WHERE scene_type_id = $1 AND track_id = $2 AND is_clothes_off = $3"
        );
        sqlx::query_as::<_, SceneTypeTrackConfig>(&query)
            .bind(scene_type_id)
            .bind(track_id)
            .bind(is_clothes_off)
            .fetch_optional(pool)
            .await
    }

    /// List all configs for a scene type, enriched with track name and slug.
    ///
    /// Ordered by track sort_order then track name.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<SceneTypeTrackConfigWithTrack>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS_WITH_TRACK} \
             FROM scene_type_track_configs c \
             JOIN tracks t ON t.id = c.track_id \
             WHERE c.scene_type_id = $1 \
             ORDER BY t.sort_order, t.name"
        );
        sqlx::query_as::<_, SceneTypeTrackConfigWithTrack>(&query)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// Insert or update a config for the given (scene_type_id, track_id) pair.
    ///
    /// On conflict, updates all mutable columns. Returns the resulting row.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateSceneTypeTrackConfig,
    ) -> Result<SceneTypeTrackConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_type_track_configs
                (scene_type_id, track_id, is_clothes_off, workflow_id,
                 prompt_template, negative_prompt_template,
                 prompt_start_clip, negative_prompt_start_clip,
                 prompt_continuation_clip, negative_prompt_continuation_clip)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (scene_type_id, track_id, is_clothes_off) DO UPDATE SET
                workflow_id = EXCLUDED.workflow_id,
                prompt_template = EXCLUDED.prompt_template,
                negative_prompt_template = EXCLUDED.negative_prompt_template,
                prompt_start_clip = EXCLUDED.prompt_start_clip,
                negative_prompt_start_clip = EXCLUDED.negative_prompt_start_clip,
                prompt_continuation_clip = EXCLUDED.prompt_continuation_clip,
                negative_prompt_continuation_clip = EXCLUDED.negative_prompt_continuation_clip,
                updated_at = now()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneTypeTrackConfig>(&query)
            .bind(input.scene_type_id)
            .bind(input.track_id)
            .bind(input.is_clothes_off)
            .bind(input.workflow_id)
            .bind(&input.prompt_template)
            .bind(&input.negative_prompt_template)
            .bind(&input.prompt_start_clip)
            .bind(&input.negative_prompt_start_clip)
            .bind(&input.prompt_continuation_clip)
            .bind(&input.negative_prompt_continuation_clip)
            .fetch_one(pool)
            .await
    }

    /// Update a config by ID. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneTypeTrackConfig,
    ) -> Result<Option<SceneTypeTrackConfig>, sqlx::Error> {
        let query = format!(
            "UPDATE scene_type_track_configs SET
                workflow_id = COALESCE($2, workflow_id),
                prompt_template = COALESCE($3, prompt_template),
                negative_prompt_template = COALESCE($4, negative_prompt_template),
                prompt_start_clip = COALESCE($5, prompt_start_clip),
                negative_prompt_start_clip = COALESCE($6, negative_prompt_start_clip),
                prompt_continuation_clip = COALESCE($7, prompt_continuation_clip),
                negative_prompt_continuation_clip = COALESCE($8, negative_prompt_continuation_clip),
                updated_at = now()
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneTypeTrackConfig>(&query)
            .bind(id)
            .bind(input.workflow_id)
            .bind(&input.prompt_template)
            .bind(&input.negative_prompt_template)
            .bind(&input.prompt_start_clip)
            .bind(&input.negative_prompt_start_clip)
            .bind(&input.prompt_continuation_clip)
            .bind(&input.negative_prompt_continuation_clip)
            .fetch_optional(pool)
            .await
    }

    /// Delete a config by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_type_track_configs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete a config by its unique (scene_type_id, track_id, is_clothes_off) triple.
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete_by_scene_type_and_track(
        pool: &PgPool,
        scene_type_id: DbId,
        track_id: DbId,
        is_clothes_off: bool,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM scene_type_track_configs \
             WHERE scene_type_id = $1 AND track_id = $2 AND is_clothes_off = $3",
        )
        .bind(scene_type_id)
        .bind(track_id)
        .bind(is_clothes_off)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
