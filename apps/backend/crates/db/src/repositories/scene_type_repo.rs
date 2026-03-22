//! Repository for the `scene_types` table.
//!
//! After PRD-123 unification, this repo also manages track associations
//! via the `scene_type_tracks` junction table (ported from `SceneCatalogRepo`).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type::{CreateSceneType, SceneType, SceneTypeWithTracks, UpdateSceneType};
use crate::models::track::Track;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, project_id, name, slug, status_id, workflow_id, workflow_json, lora_config, \
    prompt_template, description, model_config, negative_prompt_template, \
    prompt_start_clip, negative_prompt_start_clip, \
    prompt_continuation_clip, negative_prompt_continuation_clip, \
    target_duration_secs, segment_duration_secs, duration_tolerance_secs, \
    transition_segment_index, generation_params, \
    sort_order, is_active, has_clothes_off_transition, \
    is_studio_level, parent_scene_type_id, depth, \
    generation_strategy, expected_chunks, chunk_output_pattern, \
    auto_retry_enabled, auto_retry_max_attempts, auto_retry_trigger_checks, \
    auto_retry_seed_variation, auto_retry_cfg_jitter, \
    target_fps, target_resolution, \
    pipeline_id, \
    deleted_at, created_at, updated_at";

/// Column list for the `tracks` table (used in JOIN queries).
const TRACK_COLUMNS: &str =
    "t.id, t.name, t.slug, t.sort_order, t.is_active, t.pipeline_id, t.created_at, t.updated_at";

/// Provides CRUD operations for scene types and their track associations.
pub struct SceneTypeRepo;

impl SceneTypeRepo {
    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    /// Insert a new scene type, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Draft).
    /// If `is_studio_level` is `None`, defaults to `false`.
    /// `depth` is auto-calculated from the parent when `parent_scene_type_id` is set.
    pub async fn create(pool: &PgPool, input: &CreateSceneType) -> Result<SceneType, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_types
                (project_id, name, slug, status_id, workflow_id, workflow_json, lora_config,
                 prompt_template, description, model_config, negative_prompt_template,
                 prompt_start_clip, negative_prompt_start_clip,
                 prompt_continuation_clip, negative_prompt_continuation_clip,
                 target_duration_secs, segment_duration_secs,
                 duration_tolerance_secs,
                 transition_segment_index,
                 generation_params, sort_order, is_active,
                 has_clothes_off_transition, is_studio_level,
                 parent_scene_type_id,
                 generation_strategy, expected_chunks, chunk_output_pattern,
                 auto_retry_enabled, auto_retry_max_attempts,
                 auto_retry_trigger_checks, auto_retry_seed_variation,
                 auto_retry_cfg_jitter,
                 target_fps, target_resolution)
             VALUES ($1, $2, $3, COALESCE($4, 1), $5, $6, $7, $8, $9, $10, $11,
                     $12, $13, $14, $15, $16, $17,
                     COALESCE($18, 2),
                     $19,
                     $20, COALESCE($21, 0), COALESCE($22, true),
                     COALESCE($23, false), COALESCE($24, false),
                     $25,
                     COALESCE($26, 'platform_orchestrated'), $27, $28,
                     COALESCE($29, false), COALESCE($30, 3),
                     $31, COALESCE($32, true), $33,
                     $34, $35)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(input.project_id)         // $1
            .bind(&input.name)              // $2
            .bind(&input.slug)              // $3
            .bind(input.status_id)          // $4
            .bind(input.workflow_id)        // $5
            .bind(&input.workflow_json)     // $6
            .bind(&input.lora_config)       // $7
            .bind(&input.prompt_template)   // $8
            .bind(&input.description)       // $9
            .bind(&input.model_config)      // $10
            .bind(&input.negative_prompt_template) // $11
            .bind(&input.prompt_start_clip)        // $12
            .bind(&input.negative_prompt_start_clip) // $13
            .bind(&input.prompt_continuation_clip)   // $14
            .bind(&input.negative_prompt_continuation_clip) // $15
            .bind(input.target_duration_secs)  // $16
            .bind(input.segment_duration_secs) // $17
            .bind(input.duration_tolerance_secs)   // $18
            .bind(input.transition_segment_index)  // $19
            .bind(&input.generation_params)  // $20
            .bind(input.sort_order)          // $21
            .bind(input.is_active)           // $22
            .bind(input.has_clothes_off_transition) // $23
            .bind(input.is_studio_level)     // $24
            .bind(input.parent_scene_type_id) // $25
            .bind(&input.generation_strategy) // $26
            .bind(input.expected_chunks)     // $27
            .bind(&input.chunk_output_pattern) // $28
            .bind(input.auto_retry_enabled)  // $29
            .bind(input.auto_retry_max_attempts) // $30
            .bind(&input.auto_retry_trigger_checks) // $31
            .bind(input.auto_retry_seed_variation)   // $32
            .bind(input.auto_retry_cfg_jitter) // $33
            .bind(input.target_fps)            // $34
            .bind(&input.target_resolution)    // $35
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

    /// Find a scene type by slug, optionally scoped to a pipeline. Excludes soft-deleted rows.
    ///
    /// When `pipeline_id` is provided, the query is narrowed to that pipeline,
    /// which disambiguates slugs that may exist in multiple pipelines.
    pub async fn find_by_slug(
        pool: &PgPool,
        slug: &str,
        pipeline_id: Option<DbId>,
    ) -> Result<Option<SceneType>, sqlx::Error> {
        if let Some(pid) = pipeline_id {
            let query = format!(
                "SELECT {COLUMNS} FROM scene_types \
                 WHERE slug = $1 AND pipeline_id = $2 AND deleted_at IS NULL"
            );
            sqlx::query_as::<_, SceneType>(&query)
                .bind(slug)
                .bind(pid)
                .fetch_optional(pool)
                .await
        } else {
            let query =
                format!("SELECT {COLUMNS} FROM scene_types WHERE slug = $1 AND deleted_at IS NULL");
            sqlx::query_as::<_, SceneType>(&query)
                .bind(slug)
                .fetch_optional(pool)
                .await
        }
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

    /// List all active (non-deleted) scene types, optionally including inactive
    /// ones and filtering by pipeline.
    pub async fn list(
        pool: &PgPool,
        include_inactive: bool,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let mut conditions = vec!["deleted_at IS NULL".to_string()];
        let mut bind_idx = 1;

        if !include_inactive {
            conditions.push("is_active = true".to_string());
        }
        if pipeline_id.is_some() {
            conditions.push(format!("pipeline_id = ${bind_idx}"));
            bind_idx += 1;
        }
        let _ = bind_idx; // suppress unused warning

        let where_clause = conditions.join(" AND ");
        let query = format!(
            "SELECT {COLUMNS} FROM scene_types WHERE {where_clause} ORDER BY sort_order, name"
        );

        let mut q = sqlx::query_as::<_, SceneType>(&query);
        if let Some(pid) = pipeline_id {
            q = q.bind(pid);
        }
        q.fetch_all(pool).await
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
                slug = COALESCE($3, slug),
                status_id = COALESCE($4, status_id),
                workflow_id = COALESCE($5, workflow_id),
                workflow_json = COALESCE($6, workflow_json),
                lora_config = COALESCE($7, lora_config),
                prompt_template = COALESCE($8, prompt_template),
                description = COALESCE($9, description),
                model_config = COALESCE($10, model_config),
                negative_prompt_template = COALESCE($11, negative_prompt_template),
                prompt_start_clip = COALESCE($12, prompt_start_clip),
                negative_prompt_start_clip = COALESCE($13, negative_prompt_start_clip),
                prompt_continuation_clip = COALESCE($14, prompt_continuation_clip),
                negative_prompt_continuation_clip = COALESCE($15, negative_prompt_continuation_clip),
                target_duration_secs = COALESCE($16, target_duration_secs),
                segment_duration_secs = COALESCE($17, segment_duration_secs),
                duration_tolerance_secs = COALESCE($18, duration_tolerance_secs),
                transition_segment_index = COALESCE($19, transition_segment_index),
                generation_params = COALESCE($20, generation_params),
                sort_order = COALESCE($21, sort_order),
                is_active = COALESCE($22, is_active),
                has_clothes_off_transition = COALESCE($23, has_clothes_off_transition),
                is_studio_level = COALESCE($24, is_studio_level),
                parent_scene_type_id = COALESCE($25, parent_scene_type_id),
                depth = COALESCE($26, depth),
                generation_strategy = COALESCE($27, generation_strategy),
                expected_chunks = COALESCE($28, expected_chunks),
                chunk_output_pattern = COALESCE($29, chunk_output_pattern),
                auto_retry_enabled = COALESCE($30, auto_retry_enabled),
                auto_retry_max_attempts = COALESCE($31, auto_retry_max_attempts),
                auto_retry_trigger_checks = COALESCE($32, auto_retry_trigger_checks),
                auto_retry_seed_variation = COALESCE($33, auto_retry_seed_variation),
                auto_retry_cfg_jitter = COALESCE($34, auto_retry_cfg_jitter),
                target_fps = COALESCE($35, target_fps),
                target_resolution = COALESCE($36, target_resolution)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(id)                        // $1
            .bind(&input.name)               // $2
            .bind(&input.slug)               // $3
            .bind(input.status_id)           // $4
            .bind(input.workflow_id)         // $5
            .bind(&input.workflow_json)      // $6
            .bind(&input.lora_config)        // $7
            .bind(&input.prompt_template)    // $8
            .bind(&input.description)        // $9
            .bind(&input.model_config)       // $10
            .bind(&input.negative_prompt_template) // $11
            .bind(&input.prompt_start_clip)        // $12
            .bind(&input.negative_prompt_start_clip) // $13
            .bind(&input.prompt_continuation_clip)   // $14
            .bind(&input.negative_prompt_continuation_clip) // $15
            .bind(input.target_duration_secs)  // $16
            .bind(input.segment_duration_secs) // $17
            .bind(input.duration_tolerance_secs)   // $18
            .bind(input.transition_segment_index)  // $19
            .bind(&input.generation_params)  // $20
            .bind(input.sort_order)          // $21
            .bind(input.is_active)           // $22
            .bind(input.has_clothes_off_transition) // $23
            .bind(input.is_studio_level)     // $24
            .bind(input.parent_scene_type_id) // $25
            .bind(input.depth)               // $26
            .bind(&input.generation_strategy) // $27
            .bind(input.expected_chunks)     // $28
            .bind(&input.chunk_output_pattern) // $29
            .bind(input.auto_retry_enabled)  // $30
            .bind(input.auto_retry_max_attempts) // $31
            .bind(&input.auto_retry_trigger_checks) // $32
            .bind(input.auto_retry_seed_variation)   // $33
            .bind(input.auto_retry_cfg_jitter) // $34
            .bind(input.target_fps)            // $35
            .bind(&input.target_resolution)    // $36
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

    // -----------------------------------------------------------------------
    // Track association helpers (ported from SceneCatalogRepo, PRD-123)
    // -----------------------------------------------------------------------

    /// Get all tracks associated with a scene type.
    pub async fn get_tracks(pool: &PgPool, scene_type_id: DbId) -> Result<Vec<Track>, sqlx::Error> {
        let query = format!(
            "SELECT {TRACK_COLUMNS} \
             FROM tracks t \
             JOIN scene_type_tracks stt ON stt.track_id = t.id \
             WHERE stt.scene_type_id = $1 \
             ORDER BY t.sort_order, t.name"
        );
        sqlx::query_as::<_, Track>(&query)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// Replace all track associations for a scene type.
    ///
    /// Deletes existing associations, then inserts the new set.
    /// Returns an error if any track belongs to a different pipeline than the scene type.
    pub async fn set_tracks(
        pool: &PgPool,
        scene_type_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        if !track_ids.is_empty() {
            Self::validate_track_pipelines(pool, scene_type_id, track_ids).await?;
        }

        let mut tx = pool.begin().await?;
        Self::set_tracks_inner(&mut tx, scene_type_id, track_ids).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Add a single track to a scene type (idempotent).
    ///
    /// Returns an error if the track belongs to a different pipeline than the scene type.
    pub async fn add_track(
        pool: &PgPool,
        scene_type_id: DbId,
        track_id: DbId,
    ) -> Result<(), sqlx::Error> {
        Self::validate_track_pipelines(pool, scene_type_id, &[track_id]).await?;

        sqlx::query(
            "INSERT INTO scene_type_tracks (scene_type_id, track_id) \
             VALUES ($1, $2) \
             ON CONFLICT DO NOTHING",
        )
        .bind(scene_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Remove a single track from a scene type.
    ///
    /// Returns `true` if the association was removed.
    pub async fn remove_track(
        pool: &PgPool,
        scene_type_id: DbId,
        track_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM scene_type_tracks \
             WHERE scene_type_id = $1 AND track_id = $2",
        )
        .bind(scene_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all non-deleted scene types with their tracks, optionally filtered
    /// by pipeline.
    pub async fn list_with_tracks(
        pool: &PgPool,
        include_inactive: bool,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<SceneTypeWithTracks>, sqlx::Error> {
        let entries = Self::list(pool, include_inactive, pipeline_id).await?;
        let mut result = Vec::with_capacity(entries.len());

        for scene_type in entries {
            let tracks = Self::get_tracks(pool, scene_type.id).await?;
            result.push(SceneTypeWithTracks { scene_type, tracks });
        }

        Ok(result)
    }

    /// Find a scene type by ID, enriched with its tracks.
    pub async fn find_by_id_with_tracks(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SceneTypeWithTracks>, sqlx::Error> {
        let scene_type = Self::find_by_id(pool, id).await?;
        match scene_type {
            Some(scene_type) => {
                let tracks = Self::get_tracks(pool, scene_type.id).await?;
                Ok(Some(SceneTypeWithTracks { scene_type, tracks }))
            }
            None => Ok(None),
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Validate that all given tracks belong to the same pipeline as the scene type.
    ///
    /// Returns a database error if any track has a different `pipeline_id`.
    async fn validate_track_pipelines(
        pool: &PgPool,
        scene_type_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        let st_pipeline: Option<(DbId,)> =
            sqlx::query_as("SELECT pipeline_id FROM scene_types WHERE id = $1")
                .bind(scene_type_id)
                .fetch_optional(pool)
                .await?;

        let Some((scene_type_pipeline_id,)) = st_pipeline else {
            // Scene type doesn't exist — let the caller handle NotFound.
            return Ok(());
        };

        let mismatched: Vec<(DbId, DbId)> = sqlx::query_as(
            "SELECT id, pipeline_id FROM tracks \
             WHERE id = ANY($1) AND pipeline_id != $2",
        )
        .bind(track_ids)
        .bind(scene_type_pipeline_id)
        .fetch_all(pool)
        .await?;

        if !mismatched.is_empty() {
            let ids: Vec<String> = mismatched.iter().map(|(id, _)| id.to_string()).collect();
            return Err(sqlx::Error::Protocol(format!(
                "Track(s) [{}] belong to a different pipeline than the scene type (pipeline_id={})",
                ids.join(", "),
                scene_type_pipeline_id,
            )));
        }

        Ok(())
    }

    /// Replace track associations within an existing transaction.
    async fn set_tracks_inner(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scene_type_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        // Delete existing
        sqlx::query("DELETE FROM scene_type_tracks WHERE scene_type_id = $1")
            .bind(scene_type_id)
            .execute(&mut **tx)
            .await?;

        // Insert new associations
        for &track_id in track_ids {
            sqlx::query("INSERT INTO scene_type_tracks (scene_type_id, track_id) VALUES ($1, $2)")
                .bind(scene_type_id)
                .bind(track_id)
                .execute(&mut **tx)
                .await?;
        }

        Ok(())
    }
}
