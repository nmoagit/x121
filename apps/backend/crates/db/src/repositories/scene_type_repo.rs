//! Repository for the `scene_types` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type::{CreateSceneType, SceneType, UpdateSceneType};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, project_id, name, status_id, workflow_json, lora_config, \
    prompt_template, description, model_config, negative_prompt_template, \
    prompt_start_clip, negative_prompt_start_clip, \
    prompt_continuation_clip, negative_prompt_continuation_clip, \
    target_duration_secs, segment_duration_secs, duration_tolerance_secs, \
    transition_segment_index, generation_params, \
    sort_order, is_active, is_studio_level, parent_scene_type_id, depth, \
    generation_strategy, expected_chunks, chunk_output_pattern, \
    deleted_at, created_at, updated_at";

/// Provides CRUD operations for scene types.
pub struct SceneTypeRepo;

impl SceneTypeRepo {
    /// Insert a new scene type, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `is_studio_level` is `None`, defaults to `false`.
    /// `depth` is auto-calculated from the parent when `parent_scene_type_id` is set.
    pub async fn create(pool: &PgPool, input: &CreateSceneType) -> Result<SceneType, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_types
                (project_id, name, status_id, workflow_json, lora_config,
                 prompt_template, description, model_config, negative_prompt_template,
                 prompt_start_clip, negative_prompt_start_clip,
                 prompt_continuation_clip, negative_prompt_continuation_clip,
                 target_duration_secs, segment_duration_secs,
                 duration_tolerance_secs,
                 transition_segment_index,
                 generation_params, sort_order, is_active, is_studio_level,
                 parent_scene_type_id,
                 generation_strategy, expected_chunks, chunk_output_pattern)
             VALUES ($1, $2, COALESCE($3, 1), $4, $5, $6, $7, $8, $9,
                     $10, $11, $12, $13, $14, $15,
                     COALESCE($16, 2),
                     $17,
                     $18, COALESCE($19, 0), COALESCE($20, true), COALESCE($21, false),
                     $22,
                     COALESCE($23, 'platform_orchestrated'), $24, $25)
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
            .bind(input.transition_segment_index)
            .bind(&input.generation_params)
            .bind(input.sort_order)
            .bind(input.is_active)
            .bind(input.is_studio_level)
            .bind(input.parent_scene_type_id)
            .bind(&input.generation_strategy)
            .bind(input.expected_chunks)
            .bind(&input.chunk_output_pattern)
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
                transition_segment_index = COALESCE($17, transition_segment_index),
                generation_params = COALESCE($18, generation_params),
                sort_order = COALESCE($19, sort_order),
                is_active = COALESCE($20, is_active),
                is_studio_level = COALESCE($21, is_studio_level),
                parent_scene_type_id = COALESCE($22, parent_scene_type_id),
                depth = COALESCE($23, depth),
                generation_strategy = COALESCE($24, generation_strategy),
                expected_chunks = COALESCE($25, expected_chunks),
                chunk_output_pattern = COALESCE($26, chunk_output_pattern)
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
            .bind(input.transition_segment_index)
            .bind(&input.generation_params)
            .bind(input.sort_order)
            .bind(input.is_active)
            .bind(input.is_studio_level)
            .bind(input.parent_scene_type_id)
            .bind(input.depth)
            .bind(&input.generation_strategy)
            .bind(input.expected_chunks)
            .bind(&input.chunk_output_pattern)
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
    pub async fn list_by_ids(pool: &PgPool, ids: &[DbId]) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types
             WHERE id = ANY($1) AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(ids)
            .fetch_all(pool)
            .await
    }

    /// List direct children of a scene type, ordered by name. Excludes soft-deleted rows.
    pub async fn list_children(
        pool: &PgPool,
        parent_id: DbId,
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types \
             WHERE parent_scene_type_id = $1 AND deleted_at IS NULL \
             ORDER BY name"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(parent_id)
            .fetch_all(pool)
            .await
    }

    /// List IDs of direct children of a scene type. Excludes soft-deleted rows.
    pub async fn list_children_ids(
        pool: &PgPool,
        parent_id: DbId,
    ) -> Result<Vec<DbId>, sqlx::Error> {
        let rows: Vec<(DbId,)> = sqlx::query_as(
            "SELECT id FROM scene_types \
             WHERE parent_scene_type_id = $1 AND deleted_at IS NULL",
        )
        .bind(parent_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }

    /// Update only the depth column for a scene type.
    pub async fn update_depth(pool: &PgPool, id: DbId, depth: i32) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE scene_types SET depth = $1 WHERE id = $2")
            .bind(depth)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
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
