//! Repository for the `scene_types` table.
//!
//! After PRD-123 unification, this repo also manages track associations
//! via the `scene_type_tracks` junction table (ported from `SceneCatalogRepo`).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type::{CreateSceneType, SceneType, SceneTypeWithTracks, UpdateSceneType};
use crate::models::track::Track;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, project_id, name, slug, status_id, workflow_json, lora_config, \
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
    deleted_at, created_at, updated_at";

/// Column list for the `tracks` table (used in JOIN queries).
const TRACK_COLUMNS: &str =
    "t.id, t.name, t.slug, t.sort_order, t.is_active, t.created_at, t.updated_at";

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
                (project_id, name, slug, status_id, workflow_json, lora_config,
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
                 auto_retry_cfg_jitter)
             VALUES ($1, $2, $3, COALESCE($4, 1), $5, $6, $7, $8, $9, $10,
                     $11, $12, $13, $14, $15, $16,
                     COALESCE($17, 2),
                     $18,
                     $19, COALESCE($20, 0), COALESCE($21, true),
                     COALESCE($22, false), COALESCE($23, false),
                     $24,
                     COALESCE($25, 'platform_orchestrated'), $26, $27,
                     COALESCE($28, false), COALESCE($29, 3),
                     $30, COALESCE($31, true), $32)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(input.project_id)         // $1
            .bind(&input.name)              // $2
            .bind(&input.slug)              // $3
            .bind(input.status_id)          // $4
            .bind(&input.workflow_json)     // $5
            .bind(&input.lora_config)       // $6
            .bind(&input.prompt_template)   // $7
            .bind(&input.description)       // $8
            .bind(&input.model_config)      // $9
            .bind(&input.negative_prompt_template) // $10
            .bind(&input.prompt_start_clip)        // $11
            .bind(&input.negative_prompt_start_clip) // $12
            .bind(&input.prompt_continuation_clip)   // $13
            .bind(&input.negative_prompt_continuation_clip) // $14
            .bind(input.target_duration_secs)  // $15
            .bind(input.segment_duration_secs) // $16
            .bind(input.duration_tolerance_secs)   // $17
            .bind(input.transition_segment_index)  // $18
            .bind(&input.generation_params)  // $19
            .bind(input.sort_order)          // $20
            .bind(input.is_active)           // $21
            .bind(input.has_clothes_off_transition) // $22
            .bind(input.is_studio_level)     // $23
            .bind(input.parent_scene_type_id) // $24
            .bind(&input.generation_strategy) // $25
            .bind(input.expected_chunks)     // $26
            .bind(&input.chunk_output_pattern) // $27
            .bind(input.auto_retry_enabled)  // $28
            .bind(input.auto_retry_max_attempts) // $29
            .bind(&input.auto_retry_trigger_checks) // $30
            .bind(input.auto_retry_seed_variation)   // $31
            .bind(input.auto_retry_cfg_jitter) // $32
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

    /// Find a scene type by slug. Excludes soft-deleted rows.
    pub async fn find_by_slug(pool: &PgPool, slug: &str) -> Result<Option<SceneType>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM scene_types WHERE slug = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, SceneType>(&query)
            .bind(slug)
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

    /// List all active (non-deleted) scene types, optionally including inactive ones.
    pub async fn list(
        pool: &PgPool,
        include_inactive: bool,
    ) -> Result<Vec<SceneType>, sqlx::Error> {
        let query = if include_inactive {
            format!(
                "SELECT {COLUMNS} FROM scene_types WHERE deleted_at IS NULL ORDER BY sort_order, name"
            )
        } else {
            format!(
                "SELECT {COLUMNS} FROM scene_types \
                 WHERE is_active = true AND deleted_at IS NULL \
                 ORDER BY sort_order, name"
            )
        };
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
                slug = COALESCE($3, slug),
                status_id = COALESCE($4, status_id),
                workflow_json = COALESCE($5, workflow_json),
                lora_config = COALESCE($6, lora_config),
                prompt_template = COALESCE($7, prompt_template),
                description = COALESCE($8, description),
                model_config = COALESCE($9, model_config),
                negative_prompt_template = COALESCE($10, negative_prompt_template),
                prompt_start_clip = COALESCE($11, prompt_start_clip),
                negative_prompt_start_clip = COALESCE($12, negative_prompt_start_clip),
                prompt_continuation_clip = COALESCE($13, prompt_continuation_clip),
                negative_prompt_continuation_clip = COALESCE($14, negative_prompt_continuation_clip),
                target_duration_secs = COALESCE($15, target_duration_secs),
                segment_duration_secs = COALESCE($16, segment_duration_secs),
                duration_tolerance_secs = COALESCE($17, duration_tolerance_secs),
                transition_segment_index = COALESCE($18, transition_segment_index),
                generation_params = COALESCE($19, generation_params),
                sort_order = COALESCE($20, sort_order),
                is_active = COALESCE($21, is_active),
                has_clothes_off_transition = COALESCE($22, has_clothes_off_transition),
                is_studio_level = COALESCE($23, is_studio_level),
                parent_scene_type_id = COALESCE($24, parent_scene_type_id),
                depth = COALESCE($25, depth),
                generation_strategy = COALESCE($26, generation_strategy),
                expected_chunks = COALESCE($27, expected_chunks),
                chunk_output_pattern = COALESCE($28, chunk_output_pattern),
                auto_retry_enabled = COALESCE($29, auto_retry_enabled),
                auto_retry_max_attempts = COALESCE($30, auto_retry_max_attempts),
                auto_retry_trigger_checks = COALESCE($31, auto_retry_trigger_checks),
                auto_retry_seed_variation = COALESCE($32, auto_retry_seed_variation),
                auto_retry_cfg_jitter = COALESCE($33, auto_retry_cfg_jitter)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneType>(&query)
            .bind(id)                        // $1
            .bind(&input.name)               // $2
            .bind(&input.slug)               // $3
            .bind(input.status_id)           // $4
            .bind(&input.workflow_json)      // $5
            .bind(&input.lora_config)        // $6
            .bind(&input.prompt_template)    // $7
            .bind(&input.description)        // $8
            .bind(&input.model_config)       // $9
            .bind(&input.negative_prompt_template) // $10
            .bind(&input.prompt_start_clip)        // $11
            .bind(&input.negative_prompt_start_clip) // $12
            .bind(&input.prompt_continuation_clip)   // $13
            .bind(&input.negative_prompt_continuation_clip) // $14
            .bind(input.target_duration_secs)  // $15
            .bind(input.segment_duration_secs) // $16
            .bind(input.duration_tolerance_secs)   // $17
            .bind(input.transition_segment_index)  // $18
            .bind(&input.generation_params)  // $19
            .bind(input.sort_order)          // $20
            .bind(input.is_active)           // $21
            .bind(input.has_clothes_off_transition) // $22
            .bind(input.is_studio_level)     // $23
            .bind(input.parent_scene_type_id) // $24
            .bind(input.depth)               // $25
            .bind(&input.generation_strategy) // $26
            .bind(input.expected_chunks)     // $27
            .bind(&input.chunk_output_pattern) // $28
            .bind(input.auto_retry_enabled)  // $29
            .bind(input.auto_retry_max_attempts) // $30
            .bind(&input.auto_retry_trigger_checks) // $31
            .bind(input.auto_retry_seed_variation)   // $32
            .bind(input.auto_retry_cfg_jitter) // $33
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
    pub async fn set_tracks(
        pool: &PgPool,
        scene_type_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        Self::set_tracks_inner(&mut tx, scene_type_id, track_ids).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Add a single track to a scene type (idempotent).
    pub async fn add_track(
        pool: &PgPool,
        scene_type_id: DbId,
        track_id: DbId,
    ) -> Result<(), sqlx::Error> {
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

    /// List all non-deleted scene types with their tracks.
    pub async fn list_with_tracks(
        pool: &PgPool,
        include_inactive: bool,
    ) -> Result<Vec<SceneTypeWithTracks>, sqlx::Error> {
        let entries = Self::list(pool, include_inactive).await?;
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
