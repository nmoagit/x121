//! Repository for the `image_quality_scores` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::image_qa::{CreateImageQualityScore, ImageQualityScore};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, image_variant_id, character_id, check_type_id, score, status, \
    details, is_source_image, created_at, updated_at";

/// Provides CRUD operations for image quality scores.
pub struct ImageQualityScoreRepo;

impl ImageQualityScoreRepo {
    /// Insert a new quality score, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateImageQualityScore,
    ) -> Result<ImageQualityScore, sqlx::Error> {
        let query = format!(
            "INSERT INTO image_quality_scores
                (image_variant_id, character_id, check_type_id, score, status, details, is_source_image)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageQualityScore>(&query)
            .bind(input.image_variant_id)
            .bind(input.character_id)
            .bind(input.check_type_id)
            .bind(input.score)
            .bind(&input.status)
            .bind(&input.details)
            .bind(input.is_source_image)
            .fetch_one(pool)
            .await
    }

    /// List all quality scores for a given character, ordered by most recently created first.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<ImageQualityScore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_quality_scores
             WHERE character_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageQualityScore>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List quality scores for a specific image variant, ordered by most recently created first.
    pub async fn list_by_image_variant(
        pool: &PgPool,
        image_variant_id: DbId,
    ) -> Result<Vec<ImageQualityScore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_quality_scores
             WHERE image_variant_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageQualityScore>(&query)
            .bind(image_variant_id)
            .fetch_all(pool)
            .await
    }

    /// List source-image quality scores for a character (where `is_source_image = true`).
    pub async fn list_by_character_source(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<ImageQualityScore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_quality_scores
             WHERE character_id = $1 AND is_source_image = true
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageQualityScore>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Delete all quality scores for a given image variant (for re-running QA).
    ///
    /// Returns `true` if at least one row was deleted.
    pub async fn delete_by_image_variant(
        pool: &PgPool,
        image_variant_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM image_quality_scores WHERE image_variant_id = $1")
            .bind(image_variant_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
