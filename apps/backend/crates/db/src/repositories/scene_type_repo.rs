//! Repository for the `scene_types` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::scene_type::{CreateSceneType, SceneType, UpdateSceneType};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, project_id, name, status_id, workflow_json, lora_config, \
    prompt_template, description, model_config, negative_prompt_template, \
    prompt_start_clip, negative_prompt_start_clip, \
    prompt_continuation_clip, negative_prompt_continuation_clip, \
    target_duration_secs, segment_duration_secs, duration_tolerance_secs, \
    variant_applicability, transition_segment_index, generation_params, \
    sort_order, is_active, is_studio_level, deleted_at, created_at, updated_at";

/// Provides CRUD operations for scene types.
pub struct SceneTypeRepo;

impl SceneTypeRepo {
    /// Insert a new scene type, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `variant_applicability` is `None`, defaults to `'all'`.
    /// If `is_studio_level` is `None`, defaults to `false`.
    pub async fn create(pool: &PgPool, input: &CreateSceneType) -> Result<SceneType, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_types
                (project_id, name, status_id, workflow_json, lora_config,
                 prompt_template, description, model_config, negative_prompt_template,
                 prompt_start_clip, negative_prompt_start_clip,
                 prompt_continuation_clip, negative_prompt_continuation_clip,
                 target_duration_secs, segment_duration_secs,
                 duration_tolerance_secs,
                 variant_applicability, transition_segment_index,
                 generation_params, sort_order, is_active, is_studio_level)
             VALUES ($1, $2, COALESCE($3, 1), $4, $5, $6, $7, $8, $9,
                     $10, $11, $12, $13, $14, $15,
                     COALESCE($16, 2),
                     COALESCE($17, 'all'), $18,
                     $19, COALESCE($20, 0), COALESCE($21, true), COALESCE($22, false))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.workflow_json)
            .bind(&input.lora_config)
            .bind(&input.prompt_template)
            .bind(&input.description)
            .bind(&input.model_config)
            .bind(&input.negative_prompt_template)
            .bind(&input.prompt_start_clip)
            .bind(&input.negative_prompt_start_clip)
            .bind(&input.prompt_continuation_clip)
            .bind(&input.negative_prompt_continuation_clip)
            .bind(input.target_duration_secs)
            .bind(input.segment_duration_secs)
            .bind(input.duration_tolerance_secs)
            .bind(&input.variant_applicability)
            .bind(input.transition_segment_index)
            .bind(&input.generation_params)
            .bind(input.sort_order)
            .bind(input.is_active)
            .bind(input.is_studio_level)
            .fetch_one(pool)
            .await
    }

    /// Find a scene type by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SceneType>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM scene_types WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, SceneType>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List scene types scoped to a specific project, ordered by most recently created first.
    /// Excludes soft-deleted rows.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types
             WHERE project_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List studio-level scene types (those with `project_id IS NULL`),
    /// ordered by most recently created first. Excludes soft-deleted rows.
    pub async fn list_studio_level(pool: &PgPool) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types
             WHERE project_id IS NULL AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, SceneType>(&query).fetch_all(pool).await
    }

    /// Update a scene type. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSceneType,
    ) -> Result<Option<SceneType>, sqlx::Error> {
        let query = format!(
            "UPDATE scene_types SET
                name = COALESCE($2, name),
                status_id = COALESCE($3, status_id),
                workflow_json = COALESCE($4, workflow_json),
                lora_config = COALESCE($5, lora_config),
                prompt_template = COALESCE($6, prompt_template),
                description = COALESCE($7, description),
                model_config = COALESCE($8, model_config),
                negative_prompt_template = COALESCE($9, negative_prompt_template),
                prompt_start_clip = COALESCE($10, prompt_start_clip),
                negative_prompt_start_clip = COALESCE($11, negative_prompt_start_clip),
                prompt_continuation_clip = COALESCE($12, prompt_continuation_clip),
                negative_prompt_continuation_clip = COALESCE($13, negative_prompt_continuation_clip),
                target_duration_secs = COALESCE($14, target_duration_secs),
                segment_duration_secs = COALESCE($15, segment_duration_secs),
                duration_tolerance_secs = COALESCE($16, duration_tolerance_secs),
                variant_applicability = COALESCE($17, variant_applicability),
                transition_segment_index = COALESCE($18, transition_segment_index),
                generation_params = COALESCE($19, generation_params),
                sort_order = COALESCE($20, sort_order),
                is_active = COALESCE($21, is_active),
                is_studio_level = COALESCE($22, is_studio_level)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.status_id)
            .bind(&input.workflow_json)
            .bind(&input.lora_config)
            .bind(&input.prompt_template)
            .bind(&input.description)
            .bind(&input.model_config)
            .bind(&input.negative_prompt_template)
            .bind(&input.prompt_start_clip)
            .bind(&input.negative_prompt_start_clip)
            .bind(&input.prompt_continuation_clip)
            .bind(&input.negative_prompt_continuation_clip)
            .bind(input.target_duration_secs)
            .bind(input.segment_duration_secs)
            .bind(input.duration_tolerance_secs)
            .bind(&input.variant_applicability)
            .bind(input.transition_segment_index)
            .bind(&input.generation_params)
            .bind(input.sort_order)
            .bind(input.is_active)
            .bind(input.is_studio_level)
            .fetch_optional(pool)
            .await
    }

    /// List studio-level AND project-level scene types for a project.
    /// Ordered by sort_order, then name.
    pub async fn list_for_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types
             WHERE (project_id IS NULL OR project_id = $1) AND deleted_at IS NULL
             ORDER BY sort_order, name"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// List scene types by a set of IDs (for matrix generation).
    pub async fn list_by_ids(
        pool: &PgPool,
        ids: &[DbId],
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types
             WHERE id = ANY($1) AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(ids)
            .fetch_all(pool)
            .await
    }

    /// Soft-delete a scene type by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_types SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted scene type. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE scene_types SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a scene type by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_types WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
