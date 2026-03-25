//! Repository for the `annotation_presets` table (PRD-149).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::annotation_preset::{
    AnnotationPreset, CreateAnnotationPreset, UpdateAnnotationPreset,
};

/// Column list for annotation_presets queries.
const COLUMNS: &str = "id, pipeline_id, label, color, sort_order, created_at";

/// Provides CRUD operations for annotation presets.
pub struct AnnotationPresetRepo;

impl AnnotationPresetRepo {
    /// List annotation presets, optionally filtered by pipeline.
    ///
    /// When `pipeline_id` is `None`, returns all presets (global + pipeline-scoped).
    /// When `Some`, returns only presets for that pipeline (plus global ones where
    /// `pipeline_id IS NULL`).
    pub async fn list_by_pipeline(
        pool: &PgPool,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<AnnotationPreset>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM annotation_presets
             WHERE ($1::bigint IS NULL OR pipeline_id IS NULL OR pipeline_id = $1)
             ORDER BY sort_order ASC, label ASC"
        );
        sqlx::query_as::<_, AnnotationPreset>(&query)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new annotation preset.
    pub async fn create(
        pool: &PgPool,
        input: &CreateAnnotationPreset,
    ) -> Result<AnnotationPreset, sqlx::Error> {
        let query = format!(
            "INSERT INTO annotation_presets (pipeline_id, label, color, sort_order)
             VALUES ($1, $2, $3, COALESCE($4, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AnnotationPreset>(&query)
            .bind(input.pipeline_id)
            .bind(&input.label)
            .bind(&input.color)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Update an existing annotation preset. Returns `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAnnotationPreset,
    ) -> Result<Option<AnnotationPreset>, sqlx::Error> {
        let query = format!(
            "UPDATE annotation_presets SET
                label = COALESCE($1, label),
                color = COALESCE($2, color),
                sort_order = COALESCE($3, sort_order)
             WHERE id = $4
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AnnotationPreset>(&query)
            .bind(&input.label)
            .bind(&input.color)
            .bind(input.sort_order)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete an annotation preset by ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM annotation_presets WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
