//! Repository for the `image_types` table (PRD-154).
//!
//! Provides CRUD operations for image types and their track associations,
//! mirroring `SceneTypeRepo`.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::image_type::{CreateImageType, ImageType, ImageTypeWithTracks, UpdateImageType};
use crate::models::track::Track;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, slug, description, pipeline_id, workflow_id, \
    source_track_id, output_track_id, \
    prompt_template, negative_prompt_template, generation_params, \
    is_active, sort_order, deleted_at, created_at, updated_at";

/// Column list for the `tracks` table (used in JOIN queries).
const TRACK_COLUMNS: &str =
    "t.id, t.name, t.slug, t.sort_order, t.is_active, t.pipeline_id, t.created_at, t.updated_at";

/// Provides CRUD operations for image types and their track associations.
pub struct ImageTypeRepo;

impl ImageTypeRepo {
    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    /// Insert a new image type, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateImageType) -> Result<ImageType, sqlx::Error> {
        let query = format!(
            "INSERT INTO image_types
                (name, slug, description, pipeline_id, workflow_id,
                 source_track_id, output_track_id,
                 prompt_template, negative_prompt_template, generation_params,
                 is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                     COALESCE($11, true), COALESCE($12, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageType>(&query)
            .bind(&input.name)
            .bind(&input.slug)
            .bind(&input.description)
            .bind(input.pipeline_id)
            .bind(input.workflow_id)
            .bind(input.source_track_id)
            .bind(input.output_track_id)
            .bind(&input.prompt_template)
            .bind(&input.negative_prompt_template)
            .bind(&input.generation_params)
            .bind(input.is_active)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Find an image type by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ImageType>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM image_types WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, ImageType>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all active (non-deleted) image types for a pipeline, ordered by sort_order then name.
    pub async fn list_by_pipeline(
        pool: &PgPool,
        pipeline_id: DbId,
    ) -> Result<Vec<ImageType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_types
             WHERE pipeline_id = $1 AND deleted_at IS NULL
             ORDER BY sort_order, name"
        );
        sqlx::query_as::<_, ImageType>(&query)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Update an image type. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateImageType,
    ) -> Result<Option<ImageType>, sqlx::Error> {
        let query = format!(
            "UPDATE image_types SET
                name = COALESCE($2, name),
                slug = COALESCE($3, slug),
                description = COALESCE($4, description),
                workflow_id = COALESCE($5, workflow_id),
                source_track_id = COALESCE($6, source_track_id),
                output_track_id = COALESCE($7, output_track_id),
                prompt_template = COALESCE($8, prompt_template),
                negative_prompt_template = COALESCE($9, negative_prompt_template),
                generation_params = COALESCE($10, generation_params),
                is_active = COALESCE($11, is_active),
                sort_order = COALESCE($12, sort_order)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageType>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.slug)
            .bind(&input.description)
            .bind(input.workflow_id)
            .bind(input.source_track_id)
            .bind(input.output_track_id)
            .bind(&input.prompt_template)
            .bind(&input.negative_prompt_template)
            .bind(&input.generation_params)
            .bind(input.is_active)
            .bind(input.sort_order)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete an image type by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE image_types SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Track association helpers
    // -----------------------------------------------------------------------

    /// Get all tracks associated with an image type.
    pub async fn get_tracks(pool: &PgPool, image_type_id: DbId) -> Result<Vec<Track>, sqlx::Error> {
        let query = format!(
            "SELECT {TRACK_COLUMNS} \
             FROM tracks t \
             JOIN image_type_tracks itt ON itt.track_id = t.id \
             WHERE itt.image_type_id = $1 \
             ORDER BY t.sort_order, t.name"
        );
        sqlx::query_as::<_, Track>(&query)
            .bind(image_type_id)
            .fetch_all(pool)
            .await
    }

    /// Replace all track associations for an image type atomically.
    pub async fn set_tracks(
        pool: &PgPool,
        image_type_id: DbId,
        track_ids: &[DbId],
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Delete existing
        sqlx::query("DELETE FROM image_type_tracks WHERE image_type_id = $1")
            .bind(image_type_id)
            .execute(&mut *tx)
            .await?;

        // Insert new associations
        for &track_id in track_ids {
            sqlx::query("INSERT INTO image_type_tracks (image_type_id, track_id) VALUES ($1, $2)")
                .bind(image_type_id)
                .bind(track_id)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Find an image type by ID, enriched with its tracks.
    pub async fn find_by_id_with_tracks(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ImageTypeWithTracks>, sqlx::Error> {
        let image_type = Self::find_by_id(pool, id).await?;
        match image_type {
            Some(image_type) => {
                let tracks = Self::get_tracks(pool, image_type.id).await?;
                Ok(Some(ImageTypeWithTracks { image_type, tracks }))
            }
            None => Ok(None),
        }
    }

    /// List all non-deleted image types for a pipeline with their tracks.
    pub async fn list_by_pipeline_with_tracks(
        pool: &PgPool,
        pipeline_id: DbId,
    ) -> Result<Vec<ImageTypeWithTracks>, sqlx::Error> {
        let entries = Self::list_by_pipeline(pool, pipeline_id).await?;
        let mut result = Vec::with_capacity(entries.len());

        for image_type in entries {
            let tracks = Self::get_tracks(pool, image_type.id).await?;
            result.push(ImageTypeWithTracks { image_type, tracks });
        }

        Ok(result)
    }
}
