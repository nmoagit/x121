//! Repository for the `contact_sheet_images` table (PRD-103).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::contact_sheet::{ContactSheetImage, CreateContactSheetImage};

/// Column list for `contact_sheet_images` queries.
const COLUMNS: &str = "id, character_id, scene_id, face_crop_path, \
    confidence_score, frame_number, created_at, updated_at";

/// Provides CRUD operations for contact sheet face crop images.
pub struct ContactSheetRepo;

impl ContactSheetRepo {
    /// Insert a new contact sheet image record, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateContactSheetImage,
    ) -> Result<ContactSheetImage, sqlx::Error> {
        let query = format!(
            "INSERT INTO contact_sheet_images
                (character_id, scene_id, face_crop_path, confidence_score, frame_number)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ContactSheetImage>(&query)
            .bind(input.character_id)
            .bind(input.scene_id)
            .bind(&input.face_crop_path)
            .bind(input.confidence_score)
            .bind(input.frame_number)
            .fetch_one(pool)
            .await
    }

    /// Find a contact sheet image by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ContactSheetImage>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM contact_sheet_images WHERE id = $1");
        sqlx::query_as::<_, ContactSheetImage>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all contact sheet images for a character, ordered by scene then creation time.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<ContactSheetImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM contact_sheet_images
             WHERE character_id = $1
             ORDER BY scene_id ASC, created_at ASC"
        );
        sqlx::query_as::<_, ContactSheetImage>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List all contact sheet images for a scene, ordered by creation time.
    pub async fn list_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<ContactSheetImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM contact_sheet_images
             WHERE scene_id = $1
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, ContactSheetImage>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a single contact sheet image by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM contact_sheet_images WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all contact sheet images for a character. Returns the count of deleted rows.
    pub async fn delete_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM contact_sheet_images WHERE character_id = $1")
            .bind(character_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() as i64)
    }
}
